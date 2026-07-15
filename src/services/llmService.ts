import type { AnswerSource, AnswerSourceMeta, Question, TableColumn } from '../models/Assessment'
import { answerPlainText, filterSupportingSources, topRetrievedSources } from '../utils/sourceMatching'
import { parsePipeSuggestion, serializeTableAnswer } from '../utils/tableAnswer'

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

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readErrorDetail(response: Response): Promise<string> {
  const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
  return (err as { detail?: string }).detail ?? `HTTP ${response.status}`
}

async function postJsonOrThrow<T>(url: string, body: unknown): Promise<T> {
  const response = await postJson(url, body)
  if (!response.ok) throw new Error(await readErrorDetail(response))
  return response.json() as Promise<T>
}

async function parseSseStream<T = RagExtractResult>(
  response: Response,
  onChunk: (text: string) => void,
  onDone: (result: T) => void,
  onError: (message: string) => void,
  onClarification?: (question: string) => void,
  onDiagram?: (mermaid: string) => void,
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
): Promise<void> {
  let response: Response
  try {
    response = await postJson(url, body)
  } catch {
    onError('Verbindingsfout')
    return
  }
  if (!response.ok) {
    onError(await readErrorDetail(response))
    return
  }
  await parseSseStream<T>(response, onChunk, onDone, onError, onClarification, onDiagram)
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
  const res = await fetch(`/api/documents?session_id=${encodeURIComponent(sessionId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { documents: ServerDocument[] }
  return data.documents
}

export async function deleteDocument(docId: string): Promise<void> {
  await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' })
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

/** Same-origin URL for an attachment image; session-cookie auth applies. */
export function imageUrl(imageId: string): string {
  return `/api/images/${encodeURIComponent(imageId)}`
}

export async function fetchImageArrayBuffer(imageId: string): Promise<ArrayBuffer> {
  const res = await fetch(imageUrl(imageId))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.arrayBuffer()
}

export async function fetchImageDataUrl(imageId: string): Promise<string> {
  const res = await fetch(imageUrl(imageId))
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Afbeelding kon niet worden gelezen'))
    reader.readAsDataURL(blob)
  })
}

export async function deleteImage(imageId: string): Promise<void> {
  await fetch(imageUrl(imageId), { method: 'DELETE' })
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

/** Wrap plaintext paragraphs into the Tiptap HTML shape answers are stored in. */
export function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
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
  /** Called when the model responded but produced no usable answer for a question. */
  onEmpty?: (qId: string) => void
  onProgress: (filled: number, total: number) => void
  isCancelled: () => boolean
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
  const { sessionId, docIds, questions, formContext, onAnswer, onSources, onEmpty, onProgress, isCancelled } = params
  let filled = 0

  for (const question of questions) {
    if (isCancelled()) break
    onProgress(filled, questions.length)

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

  onProgress(filled, questions.length)
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

interface SmoothStreamResult {
  answers: Record<string, string>
}

// Context answers only need enough of each fact for dedup awareness; keep the
// rolling prompt bounded on large forms (mirrored server-side).
const SMOOTH_CONTEXT_CHARS = 400

async function smoothAnswersStream(
  section: SmoothSection,
  contextAnswers: SmoothAnswerInput[],
  onDone: (answers: Record<string, string>) => void,
  onError: (message: string) => void,
): Promise<void> {
  const toSnake = (a: SmoothAnswerInput) => ({
    question_id: a.questionId,
    question_text: a.questionText,
    answer: a.answer,
  })
  await postSse<SmoothStreamResult>(
    '/api/smooth/stream',
    {
      section_title: section.title,
      answers: section.answers.map(toSnake),
      context_answers: contextAnswers.map(toSnake),
    },
    () => {},
    (result) => onDone(result.answers ?? {}),
    onError,
  )
}

export interface SmoothFormParams {
  sections: SmoothSection[]
  onRewrite: (qId: string, html: string) => void
  onSectionProgress: (current: number, total: number) => void
  isCancelled: () => boolean
}

/** Post-AI-Modus smoothing pass: rewrite each section's longtext answers to
 *  remove duplication, feeding earlier sections' (smoothed) answers along as
 *  read-only context. A failing section is skipped — originals stay in place.
 *  Returns the number of answers that were rewritten. */
export async function smoothFormAnswers(params: SmoothFormParams): Promise<number> {
  const { sections, onRewrite, onSectionProgress, isCancelled } = params
  const contextAnswers: SmoothAnswerInput[] = []
  let rewritten = 0

  for (let i = 0; i < sections.length; i++) {
    if (isCancelled()) break
    onSectionProgress(i, sections.length)
    const section = sections[i]
    const finalTexts = new Map(section.answers.map((a) => [a.questionId, a.answer]))

    await smoothAnswersStream(
      section,
      contextAnswers,
      (answers) => {
        if (isCancelled()) return
        for (const a of section.answers) {
          const text = answers[a.questionId]?.trim()
          if (text && text !== a.answer) {
            finalTexts.set(a.questionId, text)
            onRewrite(a.questionId, plainTextToHtml(text))
            rewritten++
          }
        }
      },
      (err) => {
        console.warn(`[AI mode] gladstrijken van sectie "${section.title}" overgeslagen:`, err)
      },
    ).catch((err) => {
      console.warn(`[AI mode] stream fout bij gladstrijken van sectie "${section.title}":`, err)
    })

    // Later sections dedup against what the document now actually says.
    for (const a of section.answers) {
      const text = finalTexts.get(a.questionId) ?? a.answer
      contextAnswers.push({ ...a, answer: text.slice(0, SMOOTH_CONTEXT_CHARS) })
    }
  }

  onSectionProgress(sections.length, sections.length)
  return rewritten
}

export async function improveText(text: string, questionContext: string): Promise<ImproveResponse> {
  return postJsonOrThrow<ImproveResponse>('/api/improve', { text, question_context: questionContext })
}
