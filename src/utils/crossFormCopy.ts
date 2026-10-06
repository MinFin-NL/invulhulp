import type { CrossFormMapping, FormConfig, Question } from '../models/Assessment'
import { answerPlainText } from './sourceMatching'
import { radioScalar } from './answerRefs'
import { parseTableAnswer } from './tableAnswer'

export type Answer = string | string[]
export type GetAnswer = (formId: string, questionId: string) => Answer | undefined

/** Answers are Tiptap HTML; an untouched question is '' (never '<p></p>'). */
export function isEmptyAnswer(value: Answer | undefined): boolean {
  if (value === undefined) return true
  if (Array.isArray(value)) return value.length === 0
  return answerPlainText(value).trim() === ''
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Wrap plain text as the paragraph HTML a Tiptap answer is stored as. */
export function asAnswerHtml(text: string): string {
  return text
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

function findQuestion(form: FormConfig | undefined, questionId: string): Question | undefined {
  if (!form) return undefined
  for (const section of form.sections) {
    for (const sub of section.subsections) {
      for (const q of sub.questions) {
        if (q.id === questionId) return q
      }
    }
  }
  return undefined
}

/** A table answer as readable lines: "Kolom: waarde — Kolom: waarde" per row,
 *  with the notes field last. Used when a table feeds a free-text question. */
function tableAsText(value: string, sourceQuestion: Question | undefined): string {
  const parsed = parseTableAnswer(value)
  if (!parsed) return ''
  const labels = sourceQuestion?.columns?.map((c) => c.label) ?? []
  const lines = parsed.rows
    .map((row) =>
      row
        .map((cell, i) => (cell.trim() ? `${labels[i] ? `${labels[i]}: ` : ''}${cell.trim()}` : ''))
        .filter(Boolean)
        .join(' — '),
    )
    .filter(Boolean)
  if (parsed.notes.trim()) lines.push(parsed.notes.trim())
  return lines.join('\n')
}

/** A source answer as plain text for display in the suggestion panel and in the
 *  synthesize prompt — table answers readable rather than raw JSON. */
export function sourceAnswerText(value: Answer, sourceQuestion: Question | undefined): string {
  if (Array.isArray(value)) return value.join(', ')
  if (sourceQuestion?.type === 'table') return tableAsText(value, sourceQuestion)
  return answerPlainText(value.replace('\n---\n', ': '))
}

/** A source answer rendered as answer HTML, whatever its own question type. */
function sourceAsHtml(value: Answer, sourceQuestion: Question | undefined): string {
  if (Array.isArray(value)) return asAnswerHtml(value.join(', '))
  if (sourceQuestion?.type === 'text') return value
  if (sourceQuestion?.type === 'table') return asAnswerHtml(tableAsText(value, sourceQuestion))
  // Radio answers carry their follow-up after a \n---\n separator.
  return asAnswerHtml(value.replace('\n---\n', ': '))
}

function sameColumns(a: Question | undefined, b: Question | undefined): boolean {
  const ac = a?.columns ?? []
  const bc = b?.columns ?? []
  if (ac.length === 0 || ac.length !== bc.length) return false
  return ac.every((col, i) => col.id === bc[i].id)
}

/**
 * The value a `mode: 'copy'` mapping would write into the target question, or
 * null when it cannot be copied — no source answer yet, or the source value
 * doesn't fit the target's answer shape (an option that the target doesn't
 * offer, a table with different columns). Returning null is always safe: the
 * user can still fill the question by hand.
 *
 * `targetOptions` are the target's options *as resolved at render time*
 * (`mergedOptions`), so an `optionsFrom` list is honoured too.
 */
export function copyValueFor(
  mapping: CrossFormMapping,
  targetQuestion: Question,
  getAnswer: GetAnswer,
  sourceForm: FormConfig | undefined,
  targetOptions?: string[],
): Answer | null {
  const values = mapping.sourceQuestionIds
    .map((qid) => ({ qid, value: getAnswer(mapping.sourceFormId, qid) }))
    .filter((entry): entry is { qid: string; value: Answer } => !isEmptyAnswer(entry.value))
  if (values.length === 0) return null

  const options = targetOptions ?? targetQuestion.options ?? []
  // Same fact, different wording: translate the option before the check below.
  const translate = (option: string) => mapping.optionMap?.[option] ?? option

  switch (targetQuestion.type) {
    case 'checkbox': {
      // Only a single source can fill a checkbox — merging two answers would
      // invent a selection the user never made in either form.
      if (values.length > 1) return null
      const raw = values[0].value
      const picked = (Array.isArray(raw) ? raw : [radioScalar(raw)]).map(translate).filter((v) =>
        options.includes(v),
      )
      return picked.length > 0 ? picked : null
    }

    case 'radio': {
      if (values.length > 1) return null
      const raw = values[0].value
      if (Array.isArray(raw)) return null
      const scalar = translate(radioScalar(raw))
      if (!options.includes(scalar)) return null
      // Carry the follow-up along only when the target asks for one too.
      const followUp = raw.split('\n---\n')[1] ?? ''
      return targetQuestion.followUp && followUp ? `${scalar}\n---\n${followUp}` : scalar
    }

    case 'table': {
      if (values.length > 1) return null
      const raw = values[0].value
      if (typeof raw !== 'string') return null
      const sourceQuestion = findQuestion(sourceForm, values[0].qid)
      if (!sameColumns(sourceQuestion, targetQuestion)) return null
      return raw
    }

    default: {
      // Text: a single source copies over verbatim (HTML and all); several get
      // stacked, each under its own source question as a heading line.
      const html =
        values.length === 1
          ? sourceAsHtml(values[0].value, findQuestion(sourceForm, values[0].qid))
          : values
              .map((entry) => {
                const q = findQuestion(sourceForm, entry.qid)
                const heading = q ? asAnswerHtml(`${q.text}:`) : ''
                return heading + sourceAsHtml(entry.value, q)
              })
              .join('')
      // An unparsable table answer renders to nothing — don't write '' over an
      // empty question and call it prefilled.
      return html.trim() ? html : null
    }
  }
}

/** Copy mappings that target a question in `formId`. */
export function copyMappingsFor(mappings: CrossFormMapping[], formId: string): CrossFormMapping[] {
  return mappings.filter((m) => m.mode === 'copy' && m.targetFormId === formId)
}
