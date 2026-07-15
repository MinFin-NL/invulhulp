import type { Answers, Question, QuestionAttachment, RiskLevelValue, FormConfig } from '../models/Assessment'
import type { FormId } from '../stores/assessmentStore'
import { parseTableAnswer } from '../utils/tableAnswer'

export interface ExportData {
  version: '1'
  exportedAt: string
  formId: FormId
  systemName: string
  answers: Answers
  riskLevel: RiskLevelValue
  goDecision: boolean | null
  completedSections: string[]
  // Metadata only — the image bytes stay on the backend. Importing on another
  // account (or after deletion) shows a placeholder for missing images.
  attachments?: Record<string, QuestionAttachment[]>
}

function triggerDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function timestamp(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

export function exportToJson(
  answers: Answers,
  formId: FormId,
  riskLevel: RiskLevelValue,
  goDecision: boolean | null,
  completedSections: string[],
  systemName: string,
  attachments: Record<string, QuestionAttachment[]> = {},
): void {
  const data: ExportData = {
    version: '1',
    exportedAt: new Date().toISOString(),
    formId,
    systemName,
    answers,
    riskLevel,
    goDecision,
    completedSections,
    attachments,
  }
  const label = formId.toUpperCase()
  const filename = `${label}-${timestamp()}.json`

  triggerDownload(JSON.stringify(data, null, 2), filename, 'application/json')
}

export function importFromJson(file: File): Promise<ExportData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = JSON.parse(e.target?.result as string) as any
        if (raw.version !== '1' || !raw.answers) {
          reject(new Error('Ongeldig bestandsformaat'))
          return
        }
        const data: ExportData = {
          ...raw,
          formId: raw.formId ?? raw.assessmentType ?? 'aiia',
        }
        resolve(data)
      } catch {
        reject(new Error('Bestand kon niet worden gelezen'))
      }
    }
    reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'))
    reader.readAsText(file)
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function formatAnswerMd(value: string | string[] | undefined, question?: Question): string {
  if (!value) return '*(niet ingevuld)*'
  if (Array.isArray(value)) return value.length > 0 ? value.map(stripHtml).join(', ') : '*(niet ingevuld)*'
  if (question?.type === 'table') {
    const table = parseTableAnswer(value)
    if (table && table.rows.length > 0) {
      const columns = question.columns ?? []
      const esc = (s: string) => s.replace(/\|/g, '\\|')
      const md = [
        `| ${columns.map((c) => esc(c.label)).join(' | ')} |`,
        `| ${columns.map(() => '---').join(' | ')} |`,
        ...table.rows.map((row) => `| ${columns.map((_, i) => esc(row[i] ?? '')).join(' | ')} |`),
      ]
      if (table.notes.trim()) md.push('', `*${question.notesLabel ?? 'Toelichting'}:* ${table.notes.trim()}`)
      return md.join('\n')
    }
    return '*(niet ingevuld)*'
  }
  const clean = stripHtml(value).replace(/\n---\n/g, '\n\n---\n\n')
  return clean || '*(niet ingevuld)*'
}

export function exportToMarkdown(
  answers: Answers,
  formConfig: FormConfig,
  riskLevel: RiskLevelValue,
  goDecision: boolean | null,
  systemName: string,
  attachments: Record<string, QuestionAttachment[]> = {},
): void {
  const hasConditionalPartB = formConfig.features.conditionalPartB
  const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })

  const lines: string[] = []
  lines.push(`# ${formConfig.meta.docTitle}`)
  lines.push(`**Ministerie van Financiën** | ${today}`)
  if (systemName) lines.push(`**Systeem/project:** ${systemName}`)
  if (hasConditionalPartB && riskLevel) lines.push(`**Risicoclassificatie:** ${riskLevel}`)
  if (hasConditionalPartB && goDecision !== null) lines.push(`**Go-beslissing:** ${goDecision ? 'Ja' : 'Nee'}`)
  lines.push('')

  const showPartB = !hasConditionalPartB || goDecision === true

  for (const section of formConfig.sections) {
    if (hasConditionalPartB && section.part === 'B' && !showPartB) continue

    lines.push(`## ${section.title}`)
    lines.push('')

    for (const subsection of section.subsections) {
      lines.push(`### ${subsection.title}`)
      lines.push('')

      for (const question of subsection.questions) {
        lines.push(`**${question.id}** — ${question.text}`)
        lines.push('')
        lines.push(formatAnswerMd(answers[question.id], question))
        lines.push('')
        // A .md download can't carry the bytes — reference the attachment.
        for (const att of attachments[question.id] ?? []) {
          lines.push(`*Bijlage: ${att.filename}${att.caption.trim() ? ` — ${att.caption.trim()}` : ''}* (afbeelding-id: ${att.id})`)
          lines.push('')
        }
      }
    }
  }

  const filename = `${formConfig.meta.exportLabel}-${timestamp()}.md`
  triggerDownload(lines.join('\n'), filename, 'text/markdown')
}
