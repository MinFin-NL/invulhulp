import { ref, computed } from 'vue'
import { useAssessmentStore } from '../stores/assessmentStore'
import { loadForm, flattenFormQuestions } from '../services/formLoader'
import { bulkExtractFromDocument, smoothFormAnswers, verifyDocuments } from '../services/llmService'
import type { SmoothSection } from '../services/llmService'
import { stripHtml } from '../utils/sourceMatching'
import type { FormConfig } from '../models/Assessment'

// Module-level singleton — shared across all component instances
const aiModeActive = ref<Set<string>>(new Set())
const aiModeProgress = ref<Record<string, { filled: number; total: number }>>({})
const aiModeDone = ref<Record<string, number>>({})
// Total questions attempted in the last completed run, per form — used to show
// how many were left without an answer.
const aiModeTotal = ref<Record<string, number>>({})
// Question IDs the AI looked at but couldn't answer, per form. Drives the
// per-question "AI vond hier geen antwoord" markers. Transient (not persisted).
const aiModeUnanswered = ref<Record<string, Set<string>>>({})
const aiModeError = ref<Record<string, string>>({})
const aiModeCancelled: Record<string, boolean> = {}
// Final AI Modus phase: deduplicating/tightening the filled longtext answers,
// one section per LLM call. Drives the "Antwoorden gladstrijken…" banner text.
const aiModePhase = ref<Record<string, { current: number; total: number } | null>>({})
// Pre-smoothing originals per form, session-only — powers the one-click undo.
const aiModePreSmooth = ref<Record<string, Record<string, string>>>({})

// Answers with markup beyond plain paragraphs (lists, bold, …) are usually
// user-authored; smoothing works on plaintext and would flatten them.
const RICH_HTML_RE = /<(?!\/?(p|br)\b)[a-z]/i

export function useAiMode() {
  const store = useAssessmentStore()

  const readyDocIds = computed(() =>
    store.documents
      .filter((d) => !d.indexing && d.chunkCount && d.chunkCount > 0)
      .map((d) => d.id),
  )

  async function startAiMode(formId: string) {
    if (aiModeActive.value.has(formId) || readyDocIds.value.length === 0) return

    let formConfig
    try {
      formConfig = await loadForm(formId)
    } catch {
      return
    }

    const questions = flattenFormQuestions(formConfig)
    if (questions.length === 0) return

    // Pre-flight: verify documents are actually in the vector store
    const { missing } = await verifyDocuments(store.sessionId, readyDocIds.value)
    if (missing.length === readyDocIds.value.length) {
      // All documents are missing from the index — stale browser state
      aiModeError.value = { ...aiModeError.value, [formId]: 'documenten_niet_gevonden' }
      return
    }

    delete aiModeError.value[formId]
    aiModeCancelled[formId] = false
    aiModeActive.value = new Set([...aiModeActive.value, formId])
    aiModeProgress.value = { ...aiModeProgress.value, [formId]: { filled: 0, total: questions.length } }
    delete aiModeDone.value[formId]
    aiModeTotal.value = { ...aiModeTotal.value, [formId]: questions.length }
    aiModeUnanswered.value = { ...aiModeUnanswered.value, [formId]: new Set() }

    const filled = await bulkExtractFromDocument({
      sessionId: store.sessionId,
      docIds: readyDocIds.value,
      questions,
      formContext: formConfig.aiContext,
      onAnswer: (qId, value) => store.setAnswerForForm(formId, qId, value),
      onSources: (qId, meta) => store.setAnswerSourcesForForm(formId, qId, meta),
      onEmpty: (qId) => {
        const set = new Set(aiModeUnanswered.value[formId] ?? [])
        set.add(qId)
        aiModeUnanswered.value = { ...aiModeUnanswered.value, [formId]: set }
      },
      onProgress: (f, t) => {
        aiModeProgress.value = { ...aiModeProgress.value, [formId]: { filled: f, total: t } }
      },
      isCancelled: () => aiModeCancelled[formId] === true,
    })

    if (!aiModeCancelled[formId]) {
      await smoothForm(formId, formConfig)
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

  /** Final AI Modus phase: rewrite the form's longtext answers section by
   *  section to remove duplication across answers. Applies rewrites directly
   *  to the store; originals are snapshotted for a one-click undo. */
  async function smoothForm(formId: string, formConfig: FormConfig) {
    const answers = store.forms[formId]?.answers ?? {}
    const originals: Record<string, string> = {}
    const sections: SmoothSection[] = []

    for (const section of formConfig.sections) {
      const eligible: SmoothSection['answers'] = []
      for (const q of section.subsections.flatMap((ss) => ss.questions)) {
        if (q.type !== 'text' || (q.format && q.format !== 'longtext')) continue
        const value = answers[q.id]
        if (typeof value !== 'string' || !value.trim()) continue
        if (RICH_HTML_RE.test(value)) continue
        const plain = stripHtml(value).trim()
        if (!plain) continue
        eligible.push({ questionId: q.id, questionText: q.text, answer: plain })
        originals[q.id] = value
      }
      if (eligible.length > 0) sections.push({ title: section.title, answers: eligible })
    }

    // A single answer has nothing to be deduplicated against.
    if (Object.keys(originals).length < 2) return

    aiModePreSmooth.value = { ...aiModePreSmooth.value, [formId]: originals }
    aiModePhase.value = { ...aiModePhase.value, [formId]: { current: 0, total: sections.length } }
    let rewritten = 0
    try {
      rewritten = await smoothFormAnswers({
        sections,
        onRewrite: (qId, html) => store.setAnswerForForm(formId, qId, html),
        onSectionProgress: (current, total) => {
          aiModePhase.value = { ...aiModePhase.value, [formId]: { current, total } }
        },
        isCancelled: () => aiModeCancelled[formId] === true,
      })
    } finally {
      const phases = { ...aiModePhase.value }
      delete phases[formId]
      aiModePhase.value = phases
      if (rewritten === 0) clearSmoothingUndo(formId)
    }
  }

  function hasSmoothingUndo(formId: string): boolean {
    return !!aiModePreSmooth.value[formId]
  }

  /** Restore the pre-smoothing answers of the last AI Modus run. */
  function undoSmoothing(formId: string) {
    const originals = aiModePreSmooth.value[formId]
    if (!originals) return
    for (const [qId, value] of Object.entries(originals)) {
      store.setAnswerForForm(formId, qId, value)
    }
    clearSmoothingUndo(formId)
  }

  function clearSmoothingUndo(formId: string) {
    const next = { ...aiModePreSmooth.value }
    delete next[formId]
    aiModePreSmooth.value = next
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
    aiModeActive.value = new Set([...aiModeActive.value].filter((id) => id !== formId))
    const progress = aiModeProgress.value[formId]
    if (progress && progress.filled > 0) {
      aiModeDone.value = { ...aiModeDone.value, [formId]: progress.filled }
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
    // survive dismissing the banner. The undo affordance lives in the banner,
    // so its snapshot goes with it.
    clearSmoothingUndo(formId)
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
    aiModePhase,
    readyDocIds,
    startAiMode,
    cancelAiMode,
    dismissAiModeDone,
    dismissAiModeError,
    isAiUnanswered,
    clearAiUnanswered,
    hasSmoothingUndo,
    undoSmoothing,
  }
}
