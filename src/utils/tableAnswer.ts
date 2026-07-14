// Codec for 'table' question answers. A table answer is stored in the answers
// map as one JSON string: {"rows": string[][], "notes": string}. A fully empty
// table serializes to '' so existing emptiness checks keep working.

export interface TableAnswer {
  rows: string[][]
  notes: string
}

export function parseTableAnswer(value: string | string[] | undefined): TableAnswer | null {
  if (typeof value !== 'string' || !value.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || !Array.isArray(parsed.rows)) return null
    const rows = (parsed.rows as unknown[])
      .filter((r): r is unknown[] => Array.isArray(r))
      .map((r) => r.map((cell) => (typeof cell === 'string' ? cell : '')))
    return { rows, notes: typeof parsed.notes === 'string' ? parsed.notes : '' }
  } catch {
    return null
  }
}

export function serializeTableAnswer(answer: TableAnswer): string {
  const hasContent =
    answer.notes.trim() !== '' || answer.rows.some((row) => row.some((cell) => cell.trim() !== ''))
  if (!hasContent) return ''
  return JSON.stringify({ rows: answer.rows, notes: answer.notes })
}

// Flatten a table answer for source matching, summaries and other consumers
// that expect plain text.
export function tableAnswerToPlainText(answer: TableAnswer): string {
  const lines = answer.rows
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => row.map((cell) => cell.trim()).join('; '))
  if (answer.notes.trim()) lines.push(answer.notes.trim())
  return lines.join('\n')
}

// Parse the validated pipe-format suggestion the backend produces for table
// questions: one row per line, cells separated by '|', optional notes after a
// line that is exactly '---'.
export function parsePipeSuggestion(suggestion: string, columnCount: number): TableAnswer | null {
  const trimmed = suggestion.trim()
  if (!trimmed) return null
  const [rowsPart, ...notesParts] = trimmed.split(/\n---\n/)
  const rows = rowsPart
    .split('\n')
    .map((line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, ''))
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells = line.split('|').map((c) => c.trim())
      while (cells.length < columnCount) cells.push('')
      return cells.slice(0, Math.max(columnCount, 1))
    })
    .filter((row) => row.some((cell) => cell !== ''))
  const notes = notesParts.join('\n---\n').trim()
  if (rows.length === 0 && !notes) return null
  return { rows, notes }
}
