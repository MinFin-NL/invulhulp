import { ref, computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { loadForm, aiFillableQuestions, isAiFillable } from '../services/formLoader'
import { bulkExtractFromDocument, fetchImageDimensions, getAiModel, verifyDocuments } from '../services/llmService'
import { clearLocalAiBusy, setLocalAiBusy } from '../collab/dossierTransport'
import { isQuestionVisible } from '../utils/answerRefs'
import type { AnswerSource, FormConfig } from '../models/Assessment'

// Module-level singleton — shared across all component instances
const aiModeActive = ref<Set<string>>(new Set())
// Questions handled so far (answered, empty or skipped) — they run in parallel,
// so this counts finished calls, not the position in the form.
const aiModeProgress = ref<Record<string, { done: number; total: number }>>({})
const aiModeDone = ref<Record<string, number>>({})
// Total questions attempted in the last completed run, per form — used to show
// how many were left without an answer.
const aiModeTotal = ref<Record<string, number>>({})
// Question IDs the AI looked at but couldn't answer, per form. Drives the
// per-question "AI vond hier geen antwoord" markers. Transient (not persisted).
const aiModeUnanswered = ref<Record<string, Set<string>>>({})
const aiModeError = ref<Record<string, string>>({})
const aiModeCancelled: Record<string, boolean> = {}
// Per running form: aborts its calls in flight, and counts what it filled so a
// cancelled run can still report it.
const aiModeAbort: Record<string, AbortController> = {}
const aiModeFilled: Record<string, number> = {}
// A dossier-wide run: the per-form machinery above, started for a list of forms
// at once. Null when no such run is going. The per-form state stays
// authoritative — this only records which forms belong to the run, so the
// dossier page can add their progress up.
const dossierAiRun = ref<{ dossierId: string; formIds: string[] } | null>(null)

// A section's other questions, named in each extraction call so their topics
// stay out of this answer (main._scope_block). Only for prose: short fields
// and choices don't wander into a neighbour's topic. Nearest first — the
// server keeps a dozen.
const SCOPE_MAX_QUESTIONS = 12

function relatedQuestionsFor(formConfig: FormConfig): Record<string, string[]> {
  const related: Record<string, string[]> = {}
  for (const section of formConfig.sections) {
    const questions = section.subsections
      .flatMap((ss) => ss.questions)
      .filter((q) => isAiFillable(q, section))
    questions.forEach((q, i) => {
      if (q.type !== 'text' || (q.format && q.format !== 'longtext')) return
      const others = questions
        .map((other, j) => ({ other, distance: Math.abs(i - j) }))
        .filter(({ other }) => other.id !== q.id)
        .sort((x, y) => x.distance - y.distance)
        .slice(0, SCOPE_MAX_QUESTIONS)
        .map(({ other }) => other.text)
      if (others.length > 0) related[q.id] = others
    })
  }
  return related
}

// Figure attachments (see attachFigures). A figure travels with the prose
// around it, so it surfaces for plenty of loosely-related questions; these two
// caps are what keep "the AI adds the diagram where it belongs" from becoming
// "the same diagram is stapled to twenty answers".
const FIGURE_MAX_RANK = 3 // must be among the top-N retrieved chunks
const FIGURE_MAX_PER_QUESTION = 2

export function useAiMode() {
  const store = useAssessmentStore()

  const readyDocIds = computed(() =>
    store.documents
      .filter((d) => !d.indexing && d.chunkCount && d.chunkCount > 0)
      .map((d) => d.id),
  )

  async function startAiMode(formId: string) {
    if (aiModeActive.value.has(formId) || readyDocIds.value.length === 0) return

    // Capture the dossier the run started in: the user can switch dossiers
    // mid-run and answers must not leak into the newly active one.
    const dossierId = store.activeDossierId
    if (!dossierId) return
    // Cleared here, not at activation: a Stop pressed during the pre-flight
    // below must still stop this run.
    aiModeCancelled[formId] = false

    let formConfig
    try {
      formConfig = await loadForm(formId)
    } catch {
      return
    }

    // Sections another party fills in (`aiFill: false`) are left untouched, and
    // don't count toward the progress total either.
    const questions = aiFillableQuestions(formConfig)
    if (questions.length === 0) return

    // Pre-flight: verify documents are actually in the vector store
    const { missing } = await verifyDocuments(store.sessionId, readyDocIds.value)
    if (missing.length === readyDocIds.value.length) {
      // All documents are missing from the index — stale browser state
      aiModeError.value = { ...aiModeError.value, [formId]: 'documenten_niet_gevonden' }
      return
    }

    // Figures already placed in this run, so one diagram lands at its
    // best-matching question instead of on every question that retrieved it.
    const usedFigures = new Set<string>()
    // Only questions flagged for attachments render them (QuestionItem), and
    // that flag marks exactly the diagram-worthy questions — so it doubles as
    // the shortlist of places an extracted figure belongs.
    const figureTargets = new Set(questions.filter((q) => q.allowAttachments).map((q) => q.id))

    if (aiModeCancelled[formId]) {
      delete aiModeCancelled[formId]
      return
    }

    delete aiModeError.value[formId]
    const abort = new AbortController()
    aiModeAbort[formId] = abort
    aiModeFilled[formId] = 0
    aiModeActive.value = new Set([...aiModeActive.value, formId])
    aiModeProgress.value = { ...aiModeProgress.value, [formId]: { done: 0, total: questions.length } }
    delete aiModeDone.value[formId]
    aiModeTotal.value = { ...aiModeTotal.value, [formId]: questions.length }
    aiModeUnanswered.value = { ...aiModeUnanswered.value, [formId]: new Set() }

    const model = await getAiModel()
    let filled = 0
    try {
      filled = await bulkExtractFromDocument({
        sessionId: store.sessionId,
        docIds: readyDocIds.value,
        questions,
        formContext: formConfig.aiContext,
        relatedQuestions: relatedQuestionsFor(formConfig),
        onAnswer: (qId, value) => {
          store.setAnswerForForm(formId, qId, value, dossierId)
          store.recordRevisionForForm(formId, qId, value, { by: 'ai', trigger: 'ai-modus', model }, dossierId)
          aiModeFilled[formId] = (aiModeFilled[formId] ?? 0) + 1
        },
        onSources: (qId, meta) => store.setAnswerSourcesForForm(formId, qId, meta, dossierId),
        onRetrieved: (qId, sources) => {
          if (!figureTargets.has(qId)) return
          // Not awaited: fetching the image only sizes the attachment, and the
          // answer shouldn't wait on it.
          void attachFigures(formId, dossierId, qId, sources, usedFigures)
        },
        onEmpty: (qId) => {
          const set = new Set(aiModeUnanswered.value[formId] ?? [])
          set.add(qId)
          aiModeUnanswered.value = { ...aiModeUnanswered.value, [formId]: set }
        },
        onProgress: (done, total) => {
          aiModeProgress.value = { ...aiModeProgress.value, [formId]: { done, total } }
        },
        // Broadcast over Yjs awareness so the question's editor — on every
        // collaborator's screen, not just the starter's — shows the thinking bar.
        onQuestionBusy: (qId, busy) => setLocalAiBusy(dossierId, { formId, questionId: qId }, busy),
        isCancelled: () => aiModeCancelled[formId] === true,
        signal: abort.signal,
        // Reads the run's own dossier (not the active one — the user may switch),
        // and is asked only once a question's controller has its AI answer.
        shouldAnswer: (q) =>
          isQuestionVisible(q, (id) => store.dossiers[dossierId]?.forms[formId]?.answers?.[id] ?? ''),
      })
    } finally {
      // A cancelled run leaves its aborted calls' bars behind otherwise.
      clearLocalAiBusy(dossierId, formId)
      delete aiModeAbort[formId]
      delete aiModeFilled[formId]
    }

    aiModeActive.value = new Set([...aiModeActive.value].filter((id) => id !== formId))

    if (!aiModeCancelled[formId]) {
      aiModeDone.value = { ...aiModeDone.value, [formId]: filled }
      // Fully-empty run: the banner already says "found nothing", so don't also
      // spam a marker on every single question. Markers are for partial runs.
      if (filled === 0) {
        aiModeUnanswered.value = { ...aiModeUnanswered.value, [formId]: new Set() }
      }
    }
    delete aiModeCancelled[formId]
  }

  /**
   * Fill a list of forms in one go — the dossier page's "vul dit dossier in".
   * The forms run side by side: their questions share one queue in
   * llmService, which keeps to the backend's limit, so this is as fast as the
   * backend allows without overloading it.
   *
   * Callers pass the forms (the dossier page passes the empty, applicable
   * ones). AI Modus overwrites whatever is in a field, so a bulk action must
   * never be handed a form somebody already worked in.
   */
  async function startDossierAiMode(formIds: string[]) {
    if (dossierAiRun.value || formIds.length === 0) return
    if (readyDocIds.value.length === 0) return
    const dossierId = store.activeDossierId
    if (!dossierId) return

    dossierAiRun.value = { dossierId, formIds }
    try {
      await Promise.all(formIds.map((formId) => startAiMode(formId)))
    } finally {
      dossierAiRun.value = null
    }
  }

  function cancelDossierAiMode() {
    for (const formId of dossierAiRun.value?.formIds ?? []) cancelAiMode(formId)
  }

  /** Attach the figures behind an answer's retrieved chunks to that question.
   *  Callers gate on `allowAttachments` — a figure on any other question would
   *  be invisible in the form yet still surface in the exports.
   *
   *  Picks from the raw retrieval hits rather than the stored citations: a
   *  figure chunk is only its caption, so the grounding filter in
   *  buildAnswerSourceMeta drops it from the citations almost every time.
   *  Only figures whose bytes were extracted (assetId set) can be attached —
   *  see backend/pdfextract.py, which finds embedded raster images but not
   *  vector diagrams. */
  async function attachFigures(
    formId: string,
    dossierId: string,
    questionId: string,
    sources: AnswerSource[],
    usedFigures: Set<string>,
  ) {
    const figures = sources
      .slice(0, FIGURE_MAX_RANK)
      .filter((s) => s.blockType === 'figure' && s.assetId && !usedFigures.has(s.assetId))
      .slice(0, FIGURE_MAX_PER_QUESTION)
    // Claim them all before the first await: the callbacks of two questions
    // can otherwise interleave and both take the same figure.
    for (const source of figures) usedFigures.add(source.assetId!)

    for (const source of figures) {
      const assetId = source.assetId!
      const dims = await fetchImageDimensions(assetId, store.sessionId)
      if (aiModeCancelled[formId]) return
      const page = source.page ? `, pagina ${source.page}` : ''
      store.addAttachmentForForm(
        formId,
        questionId,
        {
          id: assetId,
          filename: `figuur-pagina-${source.page ?? 0}.png`,
          caption: source.figureCaption || `Afbeelding uit ${source.docName}${page}`,
          mimeType: 'image/png',
          ...dims,
          uploadedAt: Date.now(),
          sourceDocId: source.docId,
        },
        dossierId,
      )
    }
  }

  /** Whether the AI looked at this question but couldn't answer it. */
  function isAiUnanswered(formId: string, questionId: string): boolean {
    return aiModeUnanswered.value[formId]?.has(questionId) ?? false
  }

  /** Clear a per-question "no answer" marker once the user fills it in. */
  function clearAiUnanswered(formId: string, questionId: string) {
    const set = aiModeUnanswered.value[formId]
    if (!set || !set.has(questionId)) return
    const next = new Set(set)
    next.delete(questionId)
    aiModeUnanswered.value = { ...aiModeUnanswered.value, [formId]: next }
  }

  function cancelAiMode(formId: string) {
    aiModeCancelled[formId] = true
    if (!aiModeActive.value.has(formId)) return
    aiModeAbort[formId]?.abort()
    aiModeActive.value = new Set([...aiModeActive.value].filter((id) => id !== formId))
    const filled = aiModeFilled[formId] ?? 0
    if (filled > 0) {
      aiModeDone.value = { ...aiModeDone.value, [formId]: filled }
    }
  }

  function dismissAiModeDone(formId: string) {
    const next = { ...aiModeDone.value }
    delete next[formId]
    aiModeDone.value = next
    const totals = { ...aiModeTotal.value }
    delete totals[formId]
    aiModeTotal.value = totals
    // Per-question markers persist until the user fills each question, so they
    // survive dismissing the banner.
  }

  function dismissAiModeError(formId: string) {
    const next = { ...aiModeError.value }
    delete next[formId]
    aiModeError.value = next
  }

  return {
    aiModeActive,
    aiModeProgress,
    aiModeDone,
    aiModeTotal,
    aiModeUnanswered,
    aiModeError,
    readyDocIds,
    startAiMode,
    cancelAiMode,
    dossierAiRun,
    startDossierAiMode,
    cancelDossierAiMode,
    dismissAiModeDone,
    dismissAiModeError,
    isAiUnanswered,
    clearAiUnanswered,
  }
}
