import type { Answers, AnswerRevision, Question, Section } from '../models/Assessment'
import { htmlToPlainText } from '../utils/htmlRuns'
import { parseTableAnswer, tableAnswerToPlainText } from '../utils/tableAnswer'

// LJSON 1.0 — the provenance format TekstOntleder reads: one text plus spans
// that say which stretch a person wrote, an AI generated or someone copied.
// The schema is TekstOntleder's LJSONDocument.py; these types mirror it.
// Indexes count Unicode code points (Python str), end exclusive — not the
// UTF-16 units of a JS string.

interface HumanSpan {
  start_idx: number
  end_idx: number
  source_type: 'human'
  metadata: { author_name: string; author_email: string; timestamp: string }
}

interface AiSpan {
  start_idx: number
  end_idx: number
  source_type: 'ai'
  metadata: {
    model_identifier: string
    trigger_agent: string
    invoked_by?: string
    parameters: Record<string, unknown>
    prompt_hash: string
    timestamp: string
  }
}

interface CopiedSpan {
  start_idx: number
  end_idx: number
  source_type: 'copied'
  metadata: {
    original_doc_name: string
    original_doc_hash: string
    original_start_idx: number
    copied_by_name: string
    copied_by_email: string
    timestamp: string
  }
}

export type LjsonSpan = HumanSpan | AiSpan | CopiedSpan

export interface LjsonDocument {
  document_id: string
  format_version: 'LJSON_1.0'
  document_hash: string
  text: string
  provenance_spans: LjsonSpan[]
}

/** The plain text an answer contributes to the export — also what each
 *  revision stores, so revisions and the current answer diff like for like. */
export function answerExportText(value: string | string[] | undefined): string {
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.join('\n')
  const table = parseTableAnswer(value)
  if (table) return tableAnswerToPlainText(table)
  // Radio answers are "option" or "option\n---\ntoelichting".
  const [head, ...rest] = value.split('\n---\n')
  const parts = [head, rest.join('\n---\n')].map((part) =>
    /<[a-z][\s\S]*>/i.test(part) ? htmlToPlainText(part) : part.trim(),
  )
  return parts.filter((p) => p !== '').join('\n')
}

// Words and the whitespace between them, so a diff never splits a word.
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/gu) ?? []
}

// Above this many LCS cells (old tokens × new tokens) the diff falls back to
// matching a common prefix and suffix only: still right for the usual edit (a
// change in one place), and it keeps a very long answer from freezing the tab.
const MAX_LCS_CELLS = 4_000_000

/** For each token of `next`, the index of the equal token in `prev` it was kept
 *  from, or -1 when it is new. */
function keptFrom(prev: string[], next: string[]): number[] {
  const result = new Array<number>(next.length).fill(-1)
  let start = 0
  while (start < prev.length && start < next.length && prev[start] === next[start]) {
    result[start] = start
    start++
  }
  let endPrev = prev.length
  let endNext = next.length
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) {
    endPrev--
    endNext--
    result[endNext] = endPrev
  }
  const n = endPrev - start
  const m = endNext - start
  if (n === 0 || m === 0 || n * m > MAX_LCS_CELLS) return result

  // Classic LCS table over the differing middle, then walk it back.
  const width = m + 1
  const table = new Int32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        prev[start + i] === next[start + j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (prev[start + i] === next[start + j]) {
      result[start + j] = start + i
      i++
      j++
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i++
    } else {
      j++
    }
  }
  return result
}

// A stretch shorter than this many words that a revision shares with the one
// before counts as rewritten, not kept: in a rewrite a lone "de" or "wordt"
// lines up with the old text by chance, and crediting it to the old author
// would scatter one-word spans through what is really new text.
const MIN_KEPT_WORDS = 3

const isSpace = (token: string) => /^\s+$/.test(token)

/** Undo keptFrom's matches that sit in runs too short to mean anything —
 *  unless the run is all the old text had, or it starts or ends the text
 *  (a common prefix or suffix is a real anchor, not a chance match). */
function dropStrayMatches(kept: number[], next: string[], prevWords: number): number[] {
  const result = [...kept]
  let start = 0
  while (start < next.length) {
    if (result[start] < 0) {
      start++
      continue
    }
    let end = start + 1
    while (end < next.length && result[end] >= 0 && result[end] === result[end - 1] + 1) end++
    const words = next.slice(start, end).filter((t) => !isSpace(t)).length
    const atEdge = start === 0 || end === next.length
    if (!atEdge && words < MIN_KEPT_WORDS && words < prevWords) result.fill(-1, start, end)
    start = end
  }
  return result
}

export interface AttributedRun {
  text: string
  // The revision that wrote this text; null when no recorded revision did
  // (filled in before history existed, or by a client that doesn't record it).
  revision: AnswerRevision | null
}

/** Splits `current` into runs by the revision that wrote them: each revision
 *  keeps the tokens it shares with the one before and owns the ones it added. */
export function attributeAnswer(revisions: AnswerRevision[], current: string): AttributedRun[] {
  let tokens: string[] = []
  let owners: (AnswerRevision | null)[] = []
  const steps: { text: string; owner: AnswerRevision | null }[] = [
    ...revisions.map((r) => ({ text: r.text, owner: r as AnswerRevision | null })),
    // The answer as it is now: anything no revision explains has no origin.
    { text: current, owner: null },
  ]
  for (const step of steps) {
    const next = tokenize(step.text)
    const kept = dropStrayMatches(keptFrom(tokens, next), next, tokens.filter((t) => !isSpace(t)).length)
    owners = kept.map((k) => (k >= 0 ? owners[k] : step.owner))
    tokens = next
  }

  const runs: AttributedRun[] = []
  tokens.forEach((token, i) => {
    const last = runs[runs.length - 1]
    // Whitespace joins the run before it, so a span never starts on a space.
    const owner = isSpace(token) && last ? last.revision : owners[i]
    if (last && last.revision === owner) last.text += token
    else runs.push({ text: token, revision: owner })
  })
  return runs
}

const codePoints = (text: string) => [...text].length
const iso = (ms: number) => new Date(ms).toISOString()

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function spanFor(revision: AnswerRevision, start: number, end: number): Promise<LjsonSpan> {
  const timestamp = iso(revision.at)
  if (revision.by === 'ai') {
    return {
      start_idx: start,
      end_idx: end,
      source_type: 'ai',
      metadata: {
        model_identifier: revision.model || 'onbekend',
        trigger_agent: `invulhulp/${revision.trigger ?? 'ai-modus'}`,
        ...(revision.email ? { invoked_by: revision.email } : {}),
        // The prompt is assembled server-side from the form and the retrieved
        // passages; the app keeps neither the prompt nor its parameters.
        parameters: {},
        prompt_hash: 'niet vastgelegd',
        timestamp,
      },
    }
  }
  if (revision.by === 'copied') {
    return {
      start_idx: start,
      end_idx: end,
      source_type: 'copied',
      metadata: {
        original_doc_name: revision.source ?? 'onbekend formulier',
        original_doc_hash: await sha256Hex(revision.text),
        original_start_idx: 0,
        copied_by_name: revision.name ?? 'onbekend',
        copied_by_email: revision.email ?? 'onbekend',
        timestamp,
      },
    }
  }
  return {
    start_idx: start,
    end_idx: end,
    source_type: 'human',
    metadata: {
      author_name: revision.name ?? 'onbekend',
      author_email: revision.email ?? 'onbekend',
      timestamp,
    },
  }
}

export interface LjsonExportInput {
  documentId: string
  title: string
  subtitle?: string
  sections: Section[]
  answers: Answers
  history: Record<string, AnswerRevision[]>
  // Questions hidden by an unmet visibleIf are left out, as in the Word export.
  isVisible?: (question: Question) => boolean
}

/** One form as an LJSON document: headings and question texts carry no span
 *  (TekstOntleder shows them as text without origin), answers are split into
 *  spans by the revision that wrote each stretch. */
export async function buildLjsonDocument(input: LjsonExportInput): Promise<LjsonDocument> {
  let text = ''
  const spans: LjsonSpan[] = []
  const append = (part: string) => {
    const start = codePoints(text)
    text += part
    return start
  }

  append(input.title + '\n')
  if (input.subtitle) append(input.subtitle + '\n')
  for (const section of input.sections) {
    const questions = section.subsections
      .flatMap((sub) => sub.questions)
      .filter((q) => (input.isVisible?.(q) ?? true) && answerExportText(input.answers[q.id]) !== '')
    if (questions.length === 0) continue
    append(`\n${section.title}\n`)
    for (const question of questions) {
      append(`\n${question.text}\n`)
      const current = answerExportText(input.answers[question.id])
      for (const run of attributeAnswer(input.history[question.id] ?? [], current)) {
        const start = append(run.text)
        if (run.revision) spans.push(await spanFor(run.revision, start, start + codePoints(run.text)))
      }
      append('\n')
    }
  }

  return {
    document_id: input.documentId,
    format_version: 'LJSON_1.0',
    document_hash: await sha256Hex(text),
    text,
    provenance_spans: spans,
  }
}

export function downloadLjson(doc: LjsonDocument, filename: string): void {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ljson') ? filename : `${filename}.ljson`
  a.click()
  URL.revokeObjectURL(url)
}
