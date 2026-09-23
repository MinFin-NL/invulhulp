import type { AnswerSource, AnswerSourceMeta, Question, TableColumn } from '../models/Assessment'
import { answerPlainText, filterSupportingSources, topRetrievedSources } from '../utils/sourceMatching'
import { parsePipeSuggestion, serializeTableAnswer } from '../utils/tableAnswer'
import { markdownToHtml } from '../utils/htmlRuns'

export interface ImproveResponse {
  suggestion: string
  rationale: string
}

export interface RagExtractResult extends ImproveResponse {
  sources?: AnswerSource[]
}

export interface SynthesizeRequest {
  sourceAnswers: { [questionId: string]: string }
  sourceQuestions: { [questionId: string]: string }
  targetQuestion: string
  synthesisHint?: string
}

export interface ExtractDocument {
  name: string
  content: string
}

export interface ExtractRequest {
  documents: ExtractDocument[]
  targetQuestion: string
  options?: string[]
  questionType?: string
  fieldFormat?: string
  formContext?: string
  columns?: TableColumn[]
}

function postJson(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
}

/** De `detail` uit het FastAPI-antwoord, of — als er geen JSON terugkomt — een
 *  melding die zegt wát er mis is. Een onbereikbare backend komt via de
 *  dev-proxy of nginx terug als een 502/503/504 met een HTML-foutpagina; die
 *  mag niet als "Onbekende fout" eindigen, want dan zoekt de gebruiker in het
 *  bestand naar een probleem dat in de server zit. */
async function readErrorDetail(response: Response): Promise<string> {
  const err = await response.json().catch(() => null)
  const detail = (err as { detail?: string } | null)?.detail
  if (detail) return detail
  if (response.status >= 502 && response.status <= 504) {
    return `de server is niet bereikbaar (HTTP ${response.status}) — draait de backend?`
  }
  return `de server gaf HTTP ${response.status}`
}

async function postJsonOrThrow<T>(url: string, body: unknown): Promise<T> {
  const response = await postJson(url, body)
  if (!response.ok) throw new Error(await readErrorDetail(response))
  return response.json() as Promise<T>
}

/** Extra event handlers that only some streams emit, kept out of the positional
 *  callback list. `signal` aborts the request (used to cancel AI Modus). */
interface SseOptions {
  onBatch?: (data: SmoothBatchEvent) => void
  signal?: AbortSignal
}

async function parseSseStream<T = RagExtractResult>(
  response: Response,
  onChunk: (text: string) => void,
  onDone: (result: T) => void,
  onError: (message: string) => void,
  onClarification?: (question: string) => void,
  onDiagram?: (mermaid: string) => void,
  opts: SseOptions = {},
): Promise<void> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const block of parts) {
      let eventType = 'message'
      let data = ''
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ')) data = line.slice(6)
      }
      if (!data) continue
      try {
        const parsed = JSON.parse(data)
        if (eventType === 'chunk') onChunk(parsed.text ?? '')
        else if (eventType === 'batch') opts.onBatch?.(parsed as SmoothBatchEvent)
        else if (eventType === 'done') onDone(parsed as T)
        else if (eventType === 'clarification') onClarification?.(parsed.question ?? '')
        else if (eventType === 'diagram') onDiagram?.(parsed.mermaid ?? '')
        else if (eventType === 'error') onError(parsed.detail ?? 'Onbekende fout')
      } catch {
        // ignore malformed SSE events
      }
    }
  }
}

/** POST the body and hand the SSE response to parseSseStream. Network errors
 *  and non-2xx responses are reported via onError, mirroring every stream
 *  endpoint's shared error contract. */
async function postSse<T>(
  url: string,
  body: unknown,
  onChunk: (text: string) => void,
  onDone: (result: T) => void,
  onError: (message: string) => void,
  onClarification?: (question: string) => void,
  onDiagram?: (mermaid: string) => void,
  opts: SseOptions = {},
): Promise<void> {
  let response: Response
  try {
    response = await postJson(url, body, opts.signal)
  } catch {
    onError('Verbindingsfout')
    return
  }
  if (!response.ok) {
    onError(await readErrorDetail(response))
    return
  }
  await parseSseStream<T>(response, onChunk, onDone, onError, onClarification, onDiagram, opts)
}

export interface ImproveStreamOptions {
  /** Answer to a clarification question the model asked in a previous round. */
  clarification?: { question: string; answer: string }
  /** Called when the model asks for extra input instead of returning a suggestion. */
  onClarification?: (question: string) => void
  /** Called when the model includes a mermaid diagram alongside the suggestion. */
  onDiagram?: (mermaid: string) => void
}

export async function improveTextStream(
  text: string,
  questionContext: string,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
  opts?: ImproveStreamOptions,
): Promise<void> {
  await postSse(
    '/api/improve/stream',
    {
      text,
      question_context: questionContext,
      clarification_question: opts?.clarification?.question ?? '',
      clarification_answer: opts?.clarification?.answer ?? '',
    },
    onChunk,
    onDone,
    onError,
    opts?.onClarification,
    opts?.onDiagram,
  )
}

function synthesizeBody(req: SynthesizeRequest) {
  return {
    source_answers: req.sourceAnswers,
    source_questions: req.sourceQuestions,
    target_question: req.targetQuestion,
    synthesis_hint: req.synthesisHint ?? '',
  }
}

export async function synthesizeStream(
  req: SynthesizeRequest,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
): Promise<void> {
  await postSse('/api/synthesize/stream', synthesizeBody(req), onChunk, onDone, onError)
}

export interface IndexDocumentRequest {
  sessionId: string
  docId: string
  name: string
  content: string
  uploadedAt?: number
}

export interface IndexDocumentResponse {
  docId: string
  chunkCount: number
  ontology: Record<string, unknown>
}

export async function indexDocument(req: IndexDocumentRequest): Promise<IndexDocumentResponse> {
  const data = await postJsonOrThrow<{ doc_id: string; chunk_count: number; ontology: Record<string, unknown> }>(
    '/api/documents/index',
    {
      session_id: req.sessionId,
      doc_id: req.docId,
      name: req.name,
      content: req.content,
      uploaded_at: req.uploadedAt ?? Date.now(),
    },
  )
  return { docId: data.doc_id, chunkCount: data.chunk_count, ontology: data.ontology }
}

export interface UploadedPdfDocument {
  docId: string
  name: string
  content: string
  chunkCount: number
  ontology: Record<string, unknown>
  pageCount: number
  tableCount: number
  figureCount: number
}

/** Thrown when a PDF has no text layer (scanned). Callers show the Dutch
 *  "gescande PDF" message instead of a generic upload failure. */
export class PdfNoTextError extends Error {
  constructor() {
    super('PDF_NO_TEXT')
    this.name = 'PdfNoTextError'
  }
}

/** Upload a PDF for server-side extraction + indexing. Unlike indexDocument
 *  this sends the raw file, so the backend can keep tables and figures intact
 *  (see backend/pdfextract.py). Returns the extracted text and its ontology. */
export async function uploadPdfDocument(
  file: File,
  sessionId: string,
  docId: string,
  uploadedAt: number,
): Promise<UploadedPdfDocument> {
  const body = new FormData()
  body.append('file', file)
  body.append('session_id', sessionId)
  body.append('doc_id', docId)
  body.append('uploaded_at', String(uploadedAt))
  // No Content-Type header — the browser sets the multipart boundary itself.
  const res = await fetch('/api/documents/upload', { method: 'POST', body })
  if (res.status === 422) throw new PdfNoTextError()
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const data = (await res.json()) as {
    doc_id: string
    name: string
    content: string
    chunk_count: number
    ontology: Record<string, unknown>
    page_count: number
    table_count: number
    figure_count: number
  }
  return {
    docId: data.doc_id,
    name: data.name,
    content: data.content,
    chunkCount: data.chunk_count,
    ontology: data.ontology,
    pageCount: data.page_count,
    tableCount: data.table_count,
    figureCount: data.figure_count,
  }
}

export interface ServerDocument {
  doc_id: string
  session_id: string
  name: string
  content: string
  ontology: Record<string, unknown>
  chunk_count: number
  uploaded_at: number | null
}

/** Documents the backend has persisted for this user + dossier (session). */
export async function listDocuments(sessionId: string): Promise<ServerDocument[]> {
  // Timeout so a hung backend degrades to local state instead of blocking boot.
  const res = await fetch(`/api/documents?session_id=${encodeURIComponent(sessionId)}`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { documents: ServerDocument[] }
  return data.documents
}

export async function deleteDocument(docId: string, sessionId: string): Promise<void> {
  await fetch(
    `/api/documents/${encodeURIComponent(docId)}?session_id=${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  )
}

export interface UploadedImage {
  imageId: string
  filename: string
  mime: string
  size: number
}

/** Upload a question-attachment image; the backend stores the bytes and
 *  returns the id the frontend keeps in its metadata. */
export async function uploadImage(file: File, sessionId: string): Promise<UploadedImage> {
  const body = new FormData()
  body.append('file', file)
  body.append('session_id', sessionId)
  // No Content-Type header — the browser sets the multipart boundary itself.
  const res = await fetch('/api/images', { method: 'POST', body })
  if (!res.ok) throw new Error(await readErrorDetail(res))
  const data = (await res.json()) as { image_id: string; filename: string; mime: string; size: number }
  return { imageId: data.image_id, filename: data.filename, mime: data.mime, size: data.size }
}

/** Same-origin URL for an attachment image; session-cookie auth applies.
 *  session_id is a query param (these URLs land in <img src>) so the backend
 *  can resolve the dossier's storage owner for shared dossiers. */
export function imageUrl(imageId: string, sessionId: string): string {
  return `/api/images/${encodeURIComponent(imageId)}?session_id=${encodeURIComponent(sessionId)}`
}

export async function fetchImageArrayBuffer(imageId: string, sessionId: string): Promise<ArrayBuffer> {
  const res = await fetch(imageUrl(imageId, sessionId))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.arrayBuffer()
}

/** Natural pixel size of a stored image, for attachments whose bytes the
 *  browser never held (figures extracted server-side). Empty on failure —
 *  exports then fall back to decoding the bytes themselves. */
export async function fetchImageDimensions(
  imageId: string,
  sessionId: string,
): Promise<{ width?: number; height?: number }> {
  try {
    const res = await fetch(imageUrl(imageId, sessionId))
    if (!res.ok) return {}
    const bmp = await createImageBitmap(await res.blob())
    const dims = { width: bmp.width, height: bmp.height }
    bmp.close()
    return dims
  } catch {
    return {}
  }
}

export async function fetchImageDataUrl(imageId: string, sessionId: string): Promise<string> {
  const res = await fetch(imageUrl(imageId, sessionId))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Afbeelding kon niet worden gelezen'))
    reader.readAsDataURL(blob)
  })
}

export async function deleteImage(imageId: string, sessionId: string): Promise<void> {
  await fetch(imageUrl(imageId, sessionId), { method: 'DELETE' })
}

export async function verifyDocuments(sessionId: string, docIds: string[]): Promise<{ found: string[]; missing: string[] }> {
  const res = await postJson('/api/documents/verify', { session_id: sessionId, doc_ids: docIds })
  if (!res.ok) return { found: docIds, missing: [] } // fail open — don't block AI mode on verify errors
  return res.json() as Promise<{ found: string[]; missing: string[] }>
}

export interface RagExtractRequest {
  sessionId: string
  targetQuestion: string
  guidance?: string
  options?: string[]
  questionType?: string
  fieldFormat?: string
  formContext?: string
  columns?: TableColumn[]
  docIds?: string[]
  topK?: number
}

export async function extractRagStream(
  req: RagExtractRequest,
  onChunk: (text: string) => void,
  onDone: (result: RagExtractResult) => void,
  onError: (message: string) => void,
): Promise<void> {
  try {
    await postSse(
      '/api/extract/rag/stream',
      {
        session_id: req.sessionId,
        target_question: req.targetQuestion,
        guidance: req.guidance ?? '',
        options: req.options ?? [],
        question_type: req.questionType ?? 'text',
        field_format: req.fieldFormat ?? '',
        form_context: req.formContext ?? '',
        columns: req.columns ?? [],
        doc_ids: req.docIds ?? [],
        top_k: req.topK ?? 6,
      },
      onChunk,
      onDone,
      onError,
    )
  } catch (e) {
    onError(e instanceof Error ? e.message : 'Stream verbroken')
  }
}

export async function extractFromDocumentsStream(
  req: ExtractRequest,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
): Promise<void> {
  await postSse(
    '/api/extract/stream',
    {
      documents: req.documents,
      target_question: req.targetQuestion,
      options: req.options ?? [],
      question_type: req.questionType ?? 'text',
      field_format: req.fieldFormat ?? '',
      form_context: req.formContext ?? '',
      columns: req.columns ?? [],
    },
    onChunk,
    onDone,
    onError,
  )
}

export async function synthesize(req: SynthesizeRequest): Promise<ImproveResponse> {
  return postJsonOrThrow<ImproveResponse>('/api/synthesize', synthesizeBody(req))
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/
// Leading "Label:" / "Label -" prefix that weak models tend to echo back.
const LABEL_PREFIX_RE = /^\s*[\wÀ-ſ /()&'".-]{1,60}?\s*[:–-]\s+/

// Strip a leaked label prefix and any verbatim echo of the question text.
function stripLabel(text: string, questionText: string): string {
  let out = text.replace(LABEL_PREFIX_RE, '').trim() || text
  const q = questionText.trim().toLowerCase()
  if (q && out.toLowerCase().startsWith(q)) {
    out = out.slice(questionText.trim().length).replace(/^[\s:–-]+/, '').trim()
  }
  return out
}

// Literal placeholders the model sometimes copies straight from the XML template.
const PLACEHOLDERS = new Set(['jouw antwoord hier', 'jouw verbeterde versie hier', 'antwoord hier', '[invullen]'])

/** Model output → the Tiptap HTML shape answers are stored in. The models write
 *  Markdown ("- item", "**kop**") whether or not we ask them to, and wrapping
 *  that in bare <p> tags left the markers visible as source code in the editor,
 *  the summary and the exports. markdownToHtml turns them into real lists and
 *  emphasis, and escapes any raw HTML the model emitted. */
export function plainTextToHtml(text: string): string {
  return markdownToHtml(text)
}

function mapSuggestionToAnswer(question: Question, suggestion: string): string | string[] | null {
  const text = suggestion.trim()
  if (!text || /onvoldoende informatie/i.test(text)) return null
  if (PLACEHOLDERS.has(text.toLowerCase().replace(/\.+$/, ''))) return null

  if (question.type === 'radio' || question.type === 'checkbox') {
    const matched = question.options?.find(
      (opt) => opt.trim().toLowerCase() === text.toLowerCase(),
    )
    if (!matched) return null
    return question.type === 'checkbox' ? [matched] : matched
  }

  if (question.type === 'table') {
    // The backend already validated + grounded the pipe rows; parse into the
    // stored JSON shape.
    const parsed = parsePipeSuggestion(text, question.columns?.length ?? 0)
    if (!parsed) return null
    const serialized = serializeTableAnswer(parsed)
    return serialized || null
  }

  if (question.type === 'text') {
    // Short factual fields: strip labels and enforce the expected shape so a
    // confidently-wrong value (e.g. a name in an email field) is dropped.
    const isShort = question.format && question.format !== 'longtext'
    if (isShort) {
      const value = stripLabel(text, question.text)
      if (question.format === 'email') {
        const m = value.match(EMAIL_RE)
        return m ? m[0] : null
      }
      if (question.format === 'phone') {
        const m = value.match(PHONE_RE)
        return m ? m[0].trim() : null
      }
      return value || null
    }
    // Descriptive fields: wrap paragraphs for Tiptap HTML content.
    return plainTextToHtml(text)
  }

  return null
}

export interface BulkExtractParams {
  sessionId: string
  docIds: string[]
  questions: Question[]
  formContext?: string
  onAnswer: (qId: string, value: string | string[]) => void
  onSources?: (qId: string, meta: AnswerSourceMeta) => void
  /** All retrieved chunks for an answered question, before the grounding filter
   *  in buildAnswerSourceMeta drops the ones that don't support the text.
   *  Figure chunks are almost never text-supporting, so figure attachments have
   *  to be picked here rather than from the citations. */
  onRetrieved?: (qId: string, sources: AnswerSource[]) => void
  /** Called when the model responded but produced no usable answer for a question. */
  onEmpty?: (qId: string) => void
  /** The question the model is about to be asked — fires before its call, and
   *  once with null when the run is done. Drives the per-field "AI is aan het
   *  nadenken…" bar; skipped questions never fire it. */
  onQuestionStart?: (qId: string | null) => void
  onProgress: (filled: number, total: number) => void
  isCancelled: () => boolean
  /** Re-evaluated per question, just before its LLM call. Return false to skip
   *  it (e.g. a `visibleIf` condition unmet by the answers filled so far). The
   *  flattened question order puts a controlling field before its dependents, so
   *  by the time a dependent is reached its controller's answer is already set. */
  shouldAnswer?: (question: Question) => boolean
}

/** Build the source metadata for an accepted answer, keeping only the chunks
 *  that actually support it. Choice questions are exempt from the grounding
 *  warning (option labels rarely appear verbatim in source documents) and
 *  fall back to the closest retrieval matches. */
export function buildAnswerSourceMeta(
  sources: AnswerSource[] | undefined,
  value: string | string[],
  questionType: string,
): AnswerSourceMeta | null {
  if (!sources || sources.length === 0) return null
  const supporting = filterSupportingSources(answerPlainText(value), sources)
  // Table answers were grounded per cell on the server; the client sentence-
  // overlap heuristic would false-alarm on short cell fragments, so tables get
  // the same exemption as choice questions.
  const isChoice = questionType === 'radio' || questionType === 'checkbox' || questionType === 'table'
  if (isChoice) {
    return {
      sources: supporting.length > 0 ? supporting : topRetrievedSources(sources),
      grounded: true,
      createdAt: Date.now(),
    }
  }
  // No supporting passage ⇒ persist the warning, without irrelevant citations.
  return { sources: supporting, grounded: supporting.length > 0, createdAt: Date.now() }
}

export async function bulkExtractFromDocument(params: BulkExtractParams): Promise<number> {
  const { sessionId, docIds, questions, formContext, onAnswer, onSources, onRetrieved, onEmpty, onProgress, onQuestionStart, isCancelled, shouldAnswer } = params
  let filled = 0
  let skipped = 0

  for (const question of questions) {
    if (isCancelled()) break
    // Skip questions currently hidden by an unmet visibleIf — re-checked live so
    // a question that just became (in)visible is handled correctly. Costs no call.
    if (shouldAnswer && !shouldAnswer(question)) {
      skipped++
      onProgress(filled, questions.length - skipped)
      continue
    }
    onProgress(filled, questions.length - skipped)
    onQuestionStart?.(question.id)

    await extractRagStream(
      {
        sessionId,
        targetQuestion: question.text,
        guidance: question.guidance,
        options: question.options,
        questionType: question.type,
        fieldFormat: question.format,
        formContext,
        columns: question.columns,
        docIds,
      },
      () => {},
      (result) => {
        if (!isCancelled()) {
          const value = mapSuggestionToAnswer(question, result.suggestion)
          if (value !== null) {
            onAnswer(question.id, value)
            const meta = buildAnswerSourceMeta(result.sources, value, question.type)
            if (meta) onSources?.(question.id, meta)
            if (result.sources?.length) onRetrieved?.(question.id, result.sources)
            filled++
          } else {
            // Model answered but found nothing usable in the documents.
            onEmpty?.(question.id)
          }
        }
      },
      (err) => {
        console.warn(`[AI mode] vraag "${question.text}" overgeslagen:`, err)
      },
    ).catch((err) => {
      console.warn(`[AI mode] stream fout bij vraag "${question.text}":`, err)
    })
  }

  onQuestionStart?.(null)
  onProgress(filled, questions.length - skipped)
  return filled
}

export interface SmoothAnswerInput {
  questionId: string
  questionText: string
  /** Plaintext — HTML must be stripped before building the input. */
  answer: string
}

export interface SmoothSection {
  title: string
  answers: SmoothAnswerInput[]
}

export interface SmoothBatchEvent {
  index: number
  total: number
  answers: Record<string, string>
  failed: boolean
}

interface SmoothFormResult {
  answers: Record<string, string>
  batches: number
}

export interface SmoothFormParams {
  sections: SmoothSection[]
  onRewrite: (qId: string, html: string) => void
  /** Progress in batches, not sections — the server decides how many. */
  onSectionProgress: (current: number, total: number) => void
  isCancelled: () => boolean
}

/** Post-AI-Modus smoothing pass: rewrite the form's longtext answers to remove
 *  duplication across them. The server splits the form into batches that fit
 *  the model and streams each one back as it lands; the final `done` map is
 *  authoritative and reconciled last, so a batch that failed silently keeps its
 *  original text. Returns the number of answers that were rewritten. */
export async function smoothFormAnswers(params: SmoothFormParams): Promise<number> {
  const { sections, onRewrite, onSectionProgress, isCancelled } = params

  const originals = new Map<string, string>()
  for (const section of sections) {
    for (const a of section.answers) originals.set(a.questionId, a.answer)
  }
  // Plaintext currently written to the store, per question.
  const applied = new Map<string, string>(originals)

  function apply(qId: string, text: string) {
    const trimmed = text.trim()
    if (!trimmed || trimmed === applied.get(qId)) return
    applied.set(qId, trimmed)
    onRewrite(qId, plainTextToHtml(trimmed))
  }

  // The whole form streams over one connection, so cancelling means aborting it.
  const controller = new AbortController()
  const cancelPoll = setInterval(() => {
    if (isCancelled()) controller.abort()
  }, 500)

  const body = {
    sections: sections.map((s) => ({
      title: s.title,
      answers: s.answers.map((a) => ({
        question_id: a.questionId,
        question_text: a.questionText,
        answer: a.answer,
      })),
    })),
  }

  try {
    await postSse<SmoothFormResult>(
      '/api/smooth/form/stream',
      body,
      () => {},
      (result) => {
        if (isCancelled()) return
        for (const [qId, text] of Object.entries(result.answers ?? {})) {
          if (originals.has(qId)) apply(qId, text)
        }
        onSectionProgress(result.batches, result.batches)
      },
      (err) => {
        console.warn('[AI mode] gladstrijken overgeslagen:', err)
      },
      undefined,
      undefined,
      {
        signal: controller.signal,
        onBatch: (batch) => {
          if (isCancelled()) return
          for (const [qId, text] of Object.entries(batch.answers ?? {})) {
            if (originals.has(qId)) apply(qId, text)
          }
          // `current` stays 0-based (the batch just finished), matching what
          // the banners render as current + 1.
          onSectionProgress(batch.index - 1, batch.total)
        },
      },
    ).catch((err) => {
      console.warn('[AI mode] stream fout bij gladstrijken:', err)
    })
  } finally {
    clearInterval(cancelPoll)
  }

  let rewritten = 0
  for (const [qId, original] of originals) {
    if (applied.get(qId) !== original) rewritten++
  }
  return rewritten
}

export async function improveText(text: string, questionContext: string): Promise<ImproveResponse> {
  return postJsonOrThrow<ImproveResponse>('/api/improve', { text, question_context: questionContext })
}
