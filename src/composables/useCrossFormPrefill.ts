import type { FormConfig, Question } from '../models/Assessment'
import { loadCrossFormMappings, loadForm, flattenFormQuestions } from '../services/formLoader'
import { useAssessmentStore } from '../stores/assessmentStore'
import { copyMappingsFor, copyValueFor, isEmptyAnswer } from '../utils/crossFormCopy'
import { mergedOptions } from '../utils/answerRefs'
import { resolveFeiten, voorstelVoor } from '../facts/resolveFeiten'

export interface PrefillSummary {
  /** How many questions were filled in. */
  count: number
  /** The source forms they came from, uppercased for display. */
  sourceFormIds: string[]
  /** Whether any of them came from the toepassingsscan rather than a form. */
  fromScan: boolean
}

/**
 * Fill every still-empty question of `form` from what the dossier already
 * knows: first the facts (the toepassingsscan and the shared voorblad, see
 * src/facts), then every `mode: 'copy'` mapping with the answer already given
 * in the source form. Runs when the form is
 * opened, so the user sees the shared questions (contactgegevens, aanleiding,
 * doelstelling, …) already answered instead of an empty form — no AI Modus, no
 * per-question clicking.
 *
 * Only empty questions are touched, so it never overwrites the user's own work.
 * Clearing a prefilled answer and reopening the form does fill it again: the
 * answer state records no "deliberately left empty" flag, and refilling from a
 * source the user themselves wrote is the friendlier of the two failure modes.
 */
export async function prefillCopyAnswers(form: FormConfig): Promise<PrefillSummary> {
  const store = useAssessmentStore()
  const empty: PrefillSummary = { count: 0, sourceFormIds: [], fromScan: false }
  if (!store.canEdit) return empty

  const questions = new Map<string, Question>(
    flattenFormQuestions(form).map((q) => [q.id, q]),
  )
  const getAnswer = (formId: string, questionId: string) => store.forms[formId]?.answers[questionId]
  const getTargetAnswer = (questionId: string) => getAnswer(form.id, questionId) ?? ''

  // Facts first (werkplan-kompas §5): the scan and the voorblad state a fact
  // once for the whole dossier; the mappings below fill in what is left.
  const filledFrom: string[] = []
  let scanCount = 0
  const feiten = resolveFeiten({ forms: store.activeDossier.forms, kenmerken: store.kenmerken })
  for (const question of questions.values()) {
    if (!isEmptyAnswer(getAnswer(form.id, question.id))) continue
    const voorstel = voorstelVoor(feiten, form.id, question.id)
    if (!voorstel) continue
    store.setAnswerForForm(form.id, question.id, voorstel.waarde)
    if (voorstel.herkomst.soort === 'scan') scanCount++
    else filledFrom.push(voorstel.herkomst.formId)
  }

  const mappings = copyMappingsFor(await loadCrossFormMappings(), form.id)

  // Source forms supply the question types/columns copyValueFor needs; a form
  // that no longer exists simply disables its mappings. The forms facts came
  // from load too, so the banner can name them by title.
  const sourceForms = new Map<string, FormConfig | undefined>()
  await Promise.all(
    [...new Set([...mappings.map((m) => m.sourceFormId), ...filledFrom])].map(async (id) => {
      try {
        sourceForms.set(id, await loadForm(id))
      } catch {
        sourceForms.set(id, undefined)
      }
    }),
  )

  for (const mapping of mappings) {
    const question = questions.get(mapping.targetQuestionId)
    if (!question) continue
    // Never overwrite an existing answer — including one a fact or an earlier
    // mapping in this same pass just wrote.
    if (!isEmptyAnswer(getAnswer(form.id, question.id))) continue

    const value = copyValueFor(
      mapping,
      question,
      getAnswer,
      sourceForms.get(mapping.sourceFormId),
      mergedOptions(question.options, question.optionsFrom, getTargetAnswer, form),
    )
    if (value === null) continue

    store.setAnswerForForm(form.id, question.id, value)
    filledFrom.push(mapping.sourceFormId)
  }

  return { count: filledFrom.length + scanCount, sourceFormIds: [...new Set(filledFrom)], fromScan: scanCount > 0 }
}
