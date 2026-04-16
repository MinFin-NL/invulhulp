export interface ImproveResponse {
  suggestion: string
  rationale: string
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
