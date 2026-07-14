import type { AnswerSource } from '../models/Assessment'
import { parseTableAnswer, tableAnswerToPlainText } from './tableAnswer'

// Matching is text-based and intentionally forgiving: it must survive Tiptap
// HTML answers, diacritics, case and whitespace differences between the LLM
// answer and the literal document text.

export interface HighlightRange {
  start: number
  end: number
}

export interface ChunkMatch {
  ranges: HighlightRange[]
  score: number
}

// Below this score a source is considered not to support the answer.
export const GROUNDING_THRESHOLD = 0.45

// Answers up to this length (think: e-mail, phone, date, option label) are
// matched as a literal substring instead of sentence-by-sentence.
const EXACT_MATCH_MAX_CHARS = 120

const STOPWORD_MIN_WORD_LENGTH = 4

export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent ?? ''
}

/** Flatten any answer shape (checkbox arrays, radio "option\n---\nfollowup",
 *  table JSON, Tiptap HTML) into plain text for matching. */
export function answerPlainText(value: string | string[]): string {
  if (Array.isArray(value)) return value.join('; ')
  const table = parseTableAnswer(value)
  if (table) return tableAnswerToPlainText(table)
  const joined = value.split('\n---\n').join(' ')
  return /<[a-z][\s\S]*>/i.test(joined) ? stripHtml(joined) : joined
}

interface NormalizedText {
  text: string
  // Index into the original string for every normalized character.
  map: number[]
}

// Lowercase, strip diacritics, collapse whitespace — while keeping a map back
// to original offsets so match positions can be highlighted in the source.
function normalizeWithMap(input: string): NormalizedText {
  const chars: string[] = []
  const map: number[] = []
  let pendingSpace = false
  for (let i = 0; i < input.length; i++) {
    const norm = input[i].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    if (/\s/.test(norm) || norm === '') {
      if (chars.length > 0) pendingSpace = true
      continue
    }
    if (pendingSpace) {
      chars.push(' ')
      map.push(map.length > 0 ? map[map.length - 1] : i)
      pendingSpace = false
    }
    for (const c of norm) {
      chars.push(c)
      map.push(i)
    }
  }
  return { text: chars.join(''), map }
}

function normalize(input: string): string {
  return normalizeWithMap(input).text
}

function contentWords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(/[^\p{L}\p{N}@.+-]+/u)
      .filter((w) => w.length >= STOPWORD_MIN_WORD_LENGTH),
  )
}

interface Sentence {
  start: number
  end: number
}

function splitSentences(text: string): Sentence[] {
  const sentences: Sentence[] = []
  let start = 0
  const boundary = /[.!?]+\s+|\n+/g
  let m: RegExpExecArray | null
  while ((m = boundary.exec(text)) !== null) {
    const end = m.index + m[0].length
    if (text.slice(start, end).trim()) sentences.push({ start, end })
    start = end
  }
  if (text.slice(start).trim()) sentences.push({ start, end: text.length })
  return sentences
}

/** Find which parts of a chunk support the answer. Returns highlight ranges
 *  (offsets into `chunkText`) and a 0..1 support score. */
export function matchAnswerToChunk(answer: string, chunkText: string): ChunkMatch {
  const answerNorm = normalize(answer).trim()
  if (!answerNorm || !chunkText.trim()) return { ranges: [], score: 0 }

  const chunkNorm = normalizeWithMap(chunkText)

  // Exact pass: short factual answers must appear (near-)verbatim.
  if (answerNorm.length <= EXACT_MATCH_MAX_CHARS) {
    const idx = chunkNorm.text.indexOf(answerNorm)
    if (idx !== -1) {
      const start = chunkNorm.map[idx]
      const lastNormIdx = idx + answerNorm.length - 1
      const end = chunkNorm.map[Math.min(lastNormIdx, chunkNorm.map.length - 1)] + 1
      return { ranges: [{ start, end }], score: 1 }
    }
  }

  // Sentence pass: highlight chunk sentences that share enough content words
  // with the answer.
  const answerWords = contentWords(answer)
  if (answerWords.size === 0) return { ranges: [], score: 0 }

  const ranges: HighlightRange[] = []
  let best = 0
  for (const s of splitSentences(chunkText)) {
    const sentenceWords = contentWords(chunkText.slice(s.start, s.end))
    if (sentenceWords.size === 0) continue
    let overlap = 0
    for (const w of sentenceWords) if (answerWords.has(w)) overlap++
    const score = overlap / sentenceWords.size
    if (score > best) best = score
    if (score >= GROUNDING_THRESHOLD) {
      const prev = ranges[ranges.length - 1]
      if (prev && s.start <= prev.end) prev.end = s.end
      else ranges.push({ start: s.start, end: s.end })
    }
  }
  return { ranges, score: best }
}

/** true when at least one source passage supports the answer. */
export function computeGrounding(answer: string, sources: AnswerSource[]): boolean {
  return sources.some((src) => matchAnswerToChunk(answer, src.text).score >= GROUNDING_THRESHOLD)
}

/** Only the sources that actually support the answer, best match first.
 *  Retrieval returns the K nearest chunks no matter how distant, so this is
 *  what separates "was given to the model" from "backs the answer". */
export function filterSupportingSources(answer: string, sources: AnswerSource[]): AnswerSource[] {
  return sources
    .map((source) => ({ source, match: matchAnswerToChunk(answer, source.text).score }))
    .filter((s) => s.match >= GROUNDING_THRESHOLD)
    .sort((a, b) => b.match - a.match)
    .map((s) => s.source)
}

/** Best retrieval matches (LanceDB distance: lower is closer). Fallback for
 *  choice questions, where option labels rarely appear verbatim in text. */
export function topRetrievedSources(sources: AnswerSource[], n = 2): AnswerSource[] {
  return [...sources].sort((a, b) => a.score - b.score).slice(0, n)
}

export interface TextSegment {
  text: string
  marked: boolean
}

/** Cut a text into render segments from highlight ranges (assumed sorted and
 *  non-overlapping, as produced by matchAnswerToChunk). */
export function segmentText(text: string, ranges: HighlightRange[]): TextSegment[] {
  const segments: TextSegment[] = []
  let pos = 0
  for (const r of ranges) {
    if (r.start > pos) segments.push({ text: text.slice(pos, r.start), marked: false })
    segments.push({ text: text.slice(r.start, r.end), marked: true })
    pos = r.end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos), marked: false })
  return segments
}
