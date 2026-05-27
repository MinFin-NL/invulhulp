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
    throw new Error(err.detail ?? `HTTP ${response.status}`)
  }

  return response.json()
}

export async function improveText(text: string, questionContext: string): Promise<ImproveResponse> {
  const response = await fetch('/api/improve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, question_context: questionContext }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'Onbekende fout' }))
    throw new Error(err.detail ?? `HTTP ${response.status}`)
  }

  return response.json()
}
