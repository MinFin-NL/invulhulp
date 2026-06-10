import type { Question } from '../models/Assessment'

export interface ImproveResponse {
  suggestion: string
  rationale: string
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
}

async function parseSseStream(
  response: Response,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
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
        else if (eventType === 'done') onDone(parsed as ImproveResponse)
        else if (eventType === 'clarification') onClarification?.(parsed.question ?? '')
        else if (eventType === 'diagram') onDiagram?.(parsed.mermaid ?? '')
        else if (eventType === 'error') onError(parsed.detail ?? 'Onbekende fout')
      } catch {
        // ignore malformed SSE events
      }
    }
  }
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
  let response: Response
  try {
    response = await fetch('/api/improve/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        question_context: questionContext,
        clarification_question: opts?.clarification?.question ?? '',
        clarification_answer: opts?.clarification?.answer ?? '',
      }),
    })
  } catch {
    onError('Verbindingsfout')
    return
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    onError((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
    return
  }
  await parseSseStream(response, onChunk, onDone, onError, opts?.onClarification, opts?.onDiagram)
}

export async function synthesizeStream(
  req: SynthesizeRequest,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/synthesize/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_answers: req.sourceAnswers,
        source_questions: req.sourceQuestions,
        target_question: req.targetQuestion,
        synthesis_hint: req.synthesisHint ?? '',
      }),
    })
  } catch {
    onError('Verbindingsfout')
    return
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    onError((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
    return
  }
  await parseSseStream(response, onChunk, onDone, onError)
}

export interface IndexDocumentRequest {
  sessionId: string
  docId: string
  name: string
  content: string
}

export interface IndexDocumentResponse {
  docId: string
  chunkCount: number
  ontology: Record<string, unknown>
}

export async function indexDocument(req: IndexDocumentRequest): Promise<IndexDocumentResponse> {
  const response = await fetch('/api/documents/index', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: req.sessionId,
      doc_id: req.docId,
      name: req.name,
      content: req.content,
    }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
  }
  const data = (await response.json()) as { doc_id: string; chunk_count: number; ontology: Record<string, unknown> }
  return { docId: data.doc_id, chunkCount: data.chunk_count, ontology: data.ontology }
}

export async function deleteDocument(docId: string): Promise<void> {
  await fetch(`/api/documents/${encodeURIComponent(docId)}`, { method: 'DELETE' })
}

export async function verifyDocuments(sessionId: string, docIds: string[]): Promise<{ found: string[]; missing: string[] }> {
  const res = await fetch('/api/documents/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, doc_ids: docIds }),
  })
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
  docIds?: string[]
  topK?: number
}

export async function extractRagStream(
  req: RagExtractRequest,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/extract/rag/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: req.sessionId,
        target_question: req.targetQuestion,
        guidance: req.guidance ?? '',
        options: req.options ?? [],
        question_type: req.questionType ?? 'text',
        field_format: req.fieldFormat ?? '',
        form_context: req.formContext ?? '',
        doc_ids: req.docIds ?? [],
        top_k: req.topK ?? 6,
      }),
    })
  } catch {
    onError('Verbindingsfout')
    return
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    onError((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
    return
  }
  try {
    await parseSseStream(response, onChunk, onDone, onError)
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
  let response: Response
  try {
    response = await fetch('/api/extract/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: req.documents,
        target_question: req.targetQuestion,
        options: req.options ?? [],
        question_type: req.questionType ?? 'text',
        field_format: req.fieldFormat ?? '',
        form_context: req.formContext ?? '',
      }),
    })
  } catch {
    onError('Verbindingsfout')
    return
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    onError((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
    return
  }
  await parseSseStream(response, onChunk, onDone, onError)
}

export async function synthesize(req: SynthesizeRequest): Promise<ImproveResponse> {
  const response = await fetch('/api/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_answers: req.sourceAnswers,
      source_questions: req.sourceQuestions,
      target_question: req.targetQuestion,
      synthesis_hint: req.synthesisHint ?? '',
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<ImproveResponse>
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
    return text
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('')
  }

  return null
}

export interface BulkExtractParams {
  sessionId: string
  docIds: string[]
  questions: Question[]
  formContext?: string
  onAnswer: (qId: string, value: string | string[]) => void
  onProgress: (filled: number, total: number) => void
  isCancelled: () => boolean
}

export async function bulkExtractFromDocument(params: BulkExtractParams): Promise<number> {
  const { sessionId, docIds, questions, formContext, onAnswer, onProgress, isCancelled } = params
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
        docIds,
      },
      () => {},
      (result) => {
        if (!isCancelled()) {
          const value = mapSuggestionToAnswer(question, result.suggestion)
          if (value !== null) {
            onAnswer(question.id, value)
            filled++
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

export async function improveText(text: string, questionContext: string): Promise<ImproveResponse> {
  const response = await fetch('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, question_context: questionContext }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<ImproveResponse>
}
