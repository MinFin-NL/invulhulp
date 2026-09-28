import type { Answers, QuestionAttachment, RiskLevelValue } from '../models/Assessment'
import type { FormId } from '../stores/assessmentStore'

// Shape of the JSON files the app used to export. Export is gone (Word and the
// official templates replaced it), but import still restores those files.
export interface ExportData {
  version: '1'
  exportedAt: string
  formId: FormId
  // URN of the form definition this export came from, and — when the form
  // implements a MinBZK task-registry instrument — that instrument's URN. Both
  // optional: older exports predate them. See src/utils/formUrn.ts.
  formUrn?: string
  formRegistryUrn?: string
  systemName: string
  answers: Answers
  riskLevel: RiskLevelValue
  goDecision: boolean | null
  completedSections: string[]
  // Metadata only — the image bytes stay on the backend. Importing on another
  // account (or after deletion) shows a placeholder for missing images.
  attachments?: Record<string, QuestionAttachment[]>
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
