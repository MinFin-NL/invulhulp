import { defineStore } from 'pinia'
import type { Answers, RiskLevelValue } from '../models/Assessment'

export const useAssessmentStore = defineStore('assessment', {
  state: () => ({
    answers: {} as Answers,
    currentView: 'home' as string, // 'home' | sectionId | 'risk' | 'summary'
    riskLevel: null as RiskLevelValue,
    goDecision: null as boolean | null,
    completedSections: [] as string[],
  }),

  getters: {
    getAnswer: (state) => (questionId: string) => {
      return state.answers[questionId] ?? ''
    },
    isSectionCompleted: (state) => (sectionId: string) => {
      return state.completedSections.includes(sectionId)
    },
    showPartB: (state) => state.goDecision === true,
  },

  actions: {
    setAnswer(questionId: string, value: string | string[]) {
      this.answers[questionId] = value
    },
    setCurrentView(view: string) {
      this.currentView = view
    },
    setRiskLevel(level: RiskLevelValue) {
      this.riskLevel = level
    },
    setGoDecision(decision: boolean) {
      this.goDecision = decision
    },
    markSectionCompleted(sectionId: string) {
      if (!this.completedSections.includes(sectionId)) {
        this.completedSections.push(sectionId)
      }
    },
    reset() {
      this.answers = {}
      this.currentView = 'home'
      this.riskLevel = null
      this.goDecision = null
      this.completedSections = []
    },
  },

  persist: true,
})
