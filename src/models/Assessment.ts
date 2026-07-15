export type QuestionType = 'text' | 'radio' | 'checkbox' | 'table'
export type QuestionImportance = 'mandatory' | 'optional'
// Hint for AI extraction: tells the model (and client validation) what shape a
// short text field should have. Untagged text fields are treated as 'longtext'.
export type QuestionFormat = 'email' | 'phone' | 'date' | 'shorttext' | 'longtext'

// Column definition for a 'table' question. `hint` feeds both the column
// header tooltip and the AI extraction prompt.
export interface TableColumn {
  id: string
  label: string
  hint?: string
}

export interface Question {
  id: string
  text: string
  guidance?: string
  type: QuestionType
  importance: QuestionImportance
  options?: string[]
  followUp?: string
  format?: QuestionFormat
  // Opt-in: show the image-attachment control under this question. Reserved
  // for questions where a picture genuinely helps (architectuur, datamodel,
  // processchema) so the other questions stay uncluttered.
  allowAttachments?: boolean
  // Table questions only: fixed column schema plus grid bounds and the label
  // of the free-text notes field rendered under the grid.
  columns?: TableColumn[]
  notesLabel?: string
  minRows?: number
  maxRows?: number
}

export interface Subsection {
  id: string
  title: string
  description?: string
  questions: Question[]
}

export interface Section {
  id: string
  title: string
  part: 'A' | 'B' | 'C' | 'D' | 'summary'
  subsections: Subsection[]
}

export interface Answers {
  [questionId: string]: string | string[]
}

// A RAG chunk that was given to the model when it produced an answer.
// `text` is self-contained so the citation survives document deletion.
export interface AnswerSource {
  docId: string
  docName: string
  chunkIndex: number
  text: string
  score: number
}

export interface AnswerSourceMeta {
  sources: AnswerSource[]
  // false ⇒ the answer could not be matched to any source passage and the
  // field shows a hallucination warning until the user reviews/edits it.
  grounded: boolean
  createdAt: number
}

// An image attached to a question. Only this metadata is persisted client-side
// (localStorage); the bytes live on the backend under the `id`.
export interface QuestionAttachment {
  id: string // server image_id
  filename: string
  caption: string
  mimeType: string
  // Natural pixel dimensions, measured client-side at upload; used to size
  // the image in Word exports.
  width?: number
  height?: number
  uploadedAt: number
  // v2: set when the image was extracted from an uploaded source document.
  sourceDocId?: string
}

export type RiskLevelValue = 'onaanvaardbaar' | 'hoog' | 'beperkt' | 'minimaal' | null

export interface RiskLevel {
  level: RiskLevelValue
  label?: string
}

export interface RiskQuestion {
  id: string
  text: string
  guidance?: string
  yesLeadsTo: 'onaanvaardbaar' | 'hoog' | 'beperkt' | 'minimaal' | string
  noLeadsTo: 'onaanvaardbaar' | 'hoog' | 'beperkt' | 'minimaal' | string
}

// ── Form config types (JSON-driven form registry) ────────────────────────────

export interface NavStepSubsections {
  type: 'subsections'
  sectionId: string
  exclude?: string[]
  condition?: { storeKey: 'goDecision'; value: boolean }
}

export interface NavStepSpecialView {
  type: 'specialView'
  viewId: string
  label?: string
  navLabel?: string
  navGroupHeader?: string
  completionSectionId?: string
  conditionalNext?: {
    storeKey: 'goDecision'
    ifTrue: string
    ifFalse: string
  }
}

export type NavStep = NavStepSubsections | NavStepSpecialView

export interface FormHomeContent {
  notice: string
  description: string
  steps: string[]
  buttonLabel: string
}

export interface FormMeta {
  homeComponent: string
  exportLabel: string
  docTitle: string
  footerLabel: string
  filename: string
  systemNamePlaceholder?: string
  homeContent?: FormHomeContent
}

export interface FormFeatures {
  riskClassification: boolean
  decisionGate: boolean
  conditionalPartB: boolean
}

export interface RiskLevelInfoEntry {
  label: string
  description: string
  color: string
}

export interface FormConfig {
  id: string
  version: string
  title: string
  // One or two sentences describing the form's purpose, audience and tone,
  // prepended to the AI extraction prompt so answers are framed correctly.
  aiContext?: string
  meta: FormMeta
  features: FormFeatures
  navigation: NavStep[]
  sections: Section[]
  riskQuestions?: RiskQuestion[]
  riskLevelInfo?: Record<string, RiskLevelInfoEntry>
}

export interface CrossFormMapping {
  targetFormId: string
  targetQuestionId: string
  sourceFormId: string
  sourceQuestionIds: string[]
  synthesisHint: string
}

export type AssessmentData = Pick<FormConfig, 'version' | 'title' | 'sections'>
