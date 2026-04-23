export type QuestionType = 'text' | 'radio' | 'checkbox'
export type QuestionImportance = 'mandatory' | 'optional'

export interface Question {
  id: string
  text: string
  guidance?: string
  type: QuestionType
  importance: QuestionImportance
  options?: string[]
  followUp?: string
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

export interface FormMeta {
  homeComponent: string
  exportLabel: string
  docTitle: string
  footerLabel: string
  filename: string
  systemNamePlaceholder?: string
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
  meta: FormMeta
  features: FormFeatures
  navigation: NavStep[]
  sections: Section[]
  riskQuestions?: RiskQuestion[]
  riskLevelInfo?: Record<string, RiskLevelInfoEntry>
}

export interface CrossFormMapping {
  dpiaQuestionId: string
  aiiaQuestionIds: string[]
  synthesisHint: string
}

export type AssessmentData = Pick<FormConfig, 'version' | 'title' | 'sections'>
