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
  part: 'A' | 'B' | 'summary'
  subsections: Subsection[]
}

export interface AssessmentData {
  version: string
  title: string
  sections: Section[]
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
