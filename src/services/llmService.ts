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

async function parseSseStream(
  response: Response,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
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
        else if (eventType === 'error') onError(parsed.detail ?? 'Onbekende fout')
      } catch {
        // ignore malformed SSE events
      }
    }
  }
}

export async function improveTextStream(
  text: string,
  questionContext: string,
  onChunk: (text: string) => void,
  onDone: (result: ImproveResponse) => void,
  onError: (message: string) => void,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/improve/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, question_context: questionContext }),
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
