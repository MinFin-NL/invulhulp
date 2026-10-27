import type { Answers, AnswerRevision, AnswerSource, AnswerSourceMeta, Question, Section } from '../models/Assessment'
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

// What a stretch of text is in the form, so a viewer can lay the document out
// as headings, questions and answers instead of one run of text. Not part of
// LJSON 1.0: a reader that doesn't know the field ignores it. Blocks don't
// overlap and leave the newlines between them out.
export type LjsonBlockRole = 'title' | 'subtitle' | 'section' | 'question' | 'answer'

export interface LjsonBlock {
  start_idx: number
  end_idx: number
  role: LjsonBlockRole
}

export interface LjsonDocument {
  document_id: string
  format_version: 'LJSON_1.0'
  document_hash: string
  text: string
  provenance_spans: LjsonSpan[]
  structure: LjsonBlock[]
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

// ── Verbatim copies from source documents ────────────────────────────────────
// AI text is credited to the AI as a whole, but part of it may be lifted word
// for word from a passage AI Modus retrieved. Those stretches become a
// `copied` span nested inside the AI span, so a reader sees what the model took
// from a document and what it wrote itself.

// Shorter shared stretches are stock phrasing ("de verwerking van
// persoonsgegevens"), not a copy.
const MIN_COPIED_WORDS = 8

interface Word {
  // Lowercase, without diacritics or surrounding punctuation: "Wachttijd," and
  // "wachttijd" are the same word, so a copy survives a changed comma.
  norm: string
  // UTF-16 offsets into the string the word came from.
  start: number
  end: number
}

function words(text: string): Word[] {
  const result: Word[] = []
  for (const m of text.matchAll(/\S+/gu)) {
    const norm = m[0]
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/^\p{P}+|\p{P}+$/gu, '')
    if (norm) result.push({ norm, start: m.index, end: m.index + m[0].length })
  }
  return result
}

interface Copy {
  // UTF-16 offsets into the AI run.
  start: number
  end: number
  source: AnswerSource
  // UTF-16 offset of the copied passage in the source chunk's text.
  chunkStart: number
  wordsInPassage: string[]
}

/** The longest stretch of words `run` shares with `chunk`, skipping run words
 *  already claimed by an earlier copy. */
function longestShared(run: Word[], taken: boolean[], chunk: Word[]): { at: number; from: number; length: number } {
  let best = { at: 0, from: 0, length: 0 }
  let prev = new Int32Array(chunk.length + 1)
  for (let i = 1; i <= run.length; i++) {
    const row = new Int32Array(chunk.length + 1)
    if (!taken[i - 1]) {
      for (let j = 1; j <= chunk.length; j++) {
        if (run[i - 1].norm !== chunk[j - 1].norm) continue
        row[j] = prev[j - 1] + 1
        if (row[j] > best.length) best = { at: i - row[j], from: j - row[j], length: row[j] }
      }
    }
    prev = row
  }
  return best
}

/** Every stretch of at least MIN_COPIED_WORDS words that `runText` shares with
 *  one of the passages, longest first; each run word belongs to one copy. */
export function findCopies(runText: string, sources: AnswerSource[]): Copy[] {
  const run = words(runText)
  if (run.length < MIN_COPIED_WORDS) return []
  const chunks = sources.map((source) => ({ source, words: words(source.text) }))
  const taken = new Array<boolean>(run.length).fill(false)
  const copies: Copy[] = []
  for (;;) {
    let best: { at: number; from: number; length: number; chunk: (typeof chunks)[number] } | null = null
    for (const chunk of chunks) {
      const found = longestShared(run, taken, chunk.words)
      if (found.length > (best?.length ?? 0)) best = { ...found, chunk }
    }
    if (!best || best.length < MIN_COPIED_WORDS) break
    taken.fill(true, best.at, best.at + best.length)
    copies.push({
      start: run[best.at].start,
      end: run[best.at + best.length - 1].end,
      source: best.chunk.source,
      chunkStart: best.chunk.words[best.from].start,
      wordsInPassage: best.chunk.words.slice(best.from, best.from + best.length).map((w) => w.norm),
    })
  }
  return copies.sort((a, b) => a.start - b.start)
}

export interface SourceDocumentText {
  id: string
  name: string
  // Empty while a PDF is still being extracted, or for a deleted document.
  content: string
}

/** Where a copied passage starts in its document, in code points. The chunk
 *  text may differ from the document in whitespace (the chunker reflows it),
 *  so the passage is looked up by its words. Falls back to the offset inside
 *  the passage the model was given when the document text isn't there. */
function originalStart(copy: Copy, documentWords: Word[] | undefined, content: string): number {
  const passage = copy.wordsInPassage
  if (documentWords) {
    outer: for (let i = 0; i + passage.length <= documentWords.length; i++) {
      for (let k = 0; k < passage.length; k++) {
        if (documentWords[i + k].norm !== passage[k]) continue outer
      }
      return codePoints(content.slice(0, documentWords[i].start))
    }
  }
  return codePoints(copy.source.text.slice(0, copy.chunkStart))
}

export interface LjsonExportInput {
  documentId: string
  title: string
  subtitle?: string
  sections: Section[]
  answers: Answers
  history: Record<string, AnswerRevision[]>
  // The passages AI Modus cited per question, searched for verbatim copies in
  // the AI's text, and the dossier's documents to place them in.
  sources?: Record<string, AnswerSourceMeta>
  documents?: SourceDocumentText[]
  // Questions hidden by an unmet visibleIf are left out, as in the Word export.
  isVisible?: (question: Question) => boolean
  // Where the title, section titles and question texts come from: the form's
  // JSON file as served. They become `copied` spans, copied by the tool.
  formDefinition?: FormDefinitionSource
  // When the form text was copied into this document (default: now).
  exportedAt?: number
}

export interface FormDefinitionSource {
  // How the source is named in the span, e.g. "AI Impact Assessment
  // (urn:nl:minfin:tr:aiia:2.1, aiia.json)".
  name: string
  // The file's exact text: hashed, and searched for each copied string.
  raw: string
  // The tool that copied it, e.g. { name: 'Invulhulp', version: '1.0.0' }.
  tool: { name: string; version: string }
}

/** One form as an LJSON document: title, section titles and question texts
 *  are copied from the form definition (when given), answers are split into
 *  spans by the revision that wrote each stretch, and `structure` says which
 *  stretch is which. The subtitle (the system or dossier name) has no origin:
 *  the app doesn't record who typed it. */
export async function buildLjsonDocument(input: LjsonExportInput): Promise<LjsonDocument> {
  let text = ''
  const spans: LjsonSpan[] = []
  const append = (part: string) => {
    const start = codePoints(text)
    text += part
    return start
  }

  const documents = new Map((input.documents ?? []).map((d) => [d.id, d]))
  const documentWords = new Map<string, Word[]>()
  const wordsOf = (id: string) => {
    const content = documents.get(id)?.content
    if (!content) return undefined
    if (!documentWords.has(id)) documentWords.set(id, words(content))
    return documentWords.get(id)
  }
  const copiedSpan = async (copy: Copy, by: AnswerRevision, start: number, end: number): Promise<CopiedSpan> => {
    const doc = documents.get(copy.source.docId)
    const content = doc?.content ?? ''
    return {
      start_idx: start,
      end_idx: end,
      source_type: 'copied',
      metadata: {
        original_doc_name: doc?.name ?? copy.source.docName,
        original_doc_hash: await sha256Hex(content || copy.source.text),
        original_start_idx: originalStart(copy, wordsOf(copy.source.docId), content),
        // The AI did the copying, on behalf of whoever started it; the span
        // sits inside that AI span.
        copied_by_name: by.name ?? 'onbekend',
        copied_by_email: by.email ?? 'onbekend',
        timestamp: iso(by.at),
      },
    }
  }

  const structure: LjsonBlock[] = []
  const block = (part: string, role: LjsonBlockRole) => {
    const start = append(part)
    structure.push({ start_idx: start, end_idx: start + codePoints(part), role })
    return start
  }

  const form = input.formDefinition
  const formHash = form ? await sha256Hex(form.raw) : ''
  const exportedAt = iso(input.exportedAt ?? Date.now())
  /** A string from the form definition, as a span copied from that file. */
  const formText = (part: string, role: LjsonBlockRole) => {
    const start = block(part, role)
    if (!form) return
    // The file holds the string JSON-escaped; find it there to give its place.
    const at = form.raw.indexOf(JSON.stringify(part).slice(1, -1))
    spans.push({
      start_idx: start,
      end_idx: start + codePoints(part),
      source_type: 'copied',
      metadata: {
        original_doc_name: form.name,
        original_doc_hash: formHash,
        original_start_idx: at < 0 ? 0 : codePoints(form.raw.slice(0, at)),
        copied_by_name: `${form.tool.name} ${form.tool.version}`,
        // Not an address: the tool's stable identifier, so a viewer that
        // groups by email keeps it apart from people (and versions apart).
        copied_by_email: `${form.tool.name.toLowerCase()}@${form.tool.version}`,
        timestamp: exportedAt,
      },
    })
  }

  formText(input.title, 'title')
  append('\n')
  if (input.subtitle) {
    block(input.subtitle, 'subtitle')
    append('\n')
  }
  for (const section of input.sections) {
    const questions = section.subsections
      .flatMap((sub) => sub.questions)
      .filter((q) => (input.isVisible?.(q) ?? true) && answerExportText(input.answers[q.id]) !== '')
    if (questions.length === 0) continue
    append('\n')
    formText(section.title, 'section')
    append('\n')
    for (const question of questions) {
      append('\n')
      formText(question.text, 'question')
      append('\n')
      const current = answerExportText(input.answers[question.id])
      structure.push({
        start_idx: codePoints(text),
        end_idx: codePoints(text) + codePoints(current),
        role: 'answer',
      })
      for (const run of attributeAnswer(input.history[question.id] ?? [], current)) {
        const start = append(run.text)
        if (!run.revision) continue
        spans.push(await spanFor(run.revision, start, start + codePoints(run.text)))
        if (run.revision.by !== 'ai') continue
        for (const copy of findCopies(run.text, input.sources?.[question.id]?.sources ?? [])) {
          const copyStart = start + codePoints(run.text.slice(0, copy.start))
          const copyEnd = copyStart + codePoints(run.text.slice(copy.start, copy.end))
          spans.push(await copiedSpan(copy, run.revision, copyStart, copyEnd))
        }
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
    structure,
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
