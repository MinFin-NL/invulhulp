import { defineStore } from 'pinia'
import type { Answers, RiskLevelValue } from '../models/Assessment'

export type FormId = string

export interface FormState {
  answers: Answers
  currentView: string
  completedSections: string[]
  riskLevel: RiskLevelValue
  goDecision: boolean | null
}

function initialFormState(): FormState {
  return {
    answers: {},
    currentView: 'home',
    completedSections: [],
    riskLevel: null,
    goDecision: null,
  }
}

export const useAssessmentStore = defineStore('assessment', {
  state: () => ({
    activeFormId: null as FormId | null,
    forms: {} as Record<FormId, FormState>,
  }),

  getters: {
    activeForm: (state): FormState =>
      state.activeFormId ? (state.forms[state.activeFormId] ?? initialFormState()) : initialFormState(),
    answers(): Answers { return this.activeForm.answers },
    currentView(): string { return this.activeForm.currentView },
    completedSections(): string[] { return this.activeForm.completedSections },
    riskLevel(): RiskLevelValue { return this.activeForm.riskLevel },
    goDecision(): boolean | null { return this.activeForm.goDecision },
    showPartB(): boolean { return this.activeForm.goDecision === true },

    getAnswer(): (questionId: string) => string | string[] {
      return (questionId: string) => this.activeForm.answers[questionId] ?? ''
    },
    isSectionCompleted(): (sectionId: string) => boolean {
      return (sectionId: string) => this.activeForm.completedSections.includes(sectionId)
    },
  },

  actions: {
    setActiveForm(id: FormId) {
      if (!this.forms[id]) this.forms[id] = initialFormState()
      this.activeFormId = id
    },

    setAnswer(questionId: string, value: string | string[]) {
      this.activeForm.answers[questionId] = value
    },

    setCurrentView(view: string) {
      this.activeForm.currentView = view
    },

    setRiskLevel(level: RiskLevelValue) {
      this.activeForm.riskLevel = level
    },

    setGoDecision(decision: boolean) {
      this.activeForm.goDecision = decision
    },

    markSectionCompleted(sectionId: string) {
      if (!this.activeForm.completedSections.includes(sectionId)) {
        this.activeForm.completedSections.push(sectionId)
      }
    },

    goToPortal() {
      this.activeFormId = null
    },

    resetActive() {
      if (this.activeFormId) this.forms[this.activeFormId] = initialFormState()
    },

    reset() {
      for (const id of Object.keys(this.forms)) {
        this.forms[id] = initialFormState()
      }
    },
  },

  persist: true,
})
