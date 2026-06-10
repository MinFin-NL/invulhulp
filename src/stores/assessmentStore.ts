import { defineStore } from 'pinia'
import type { Answers, AnswerSourceMeta, RiskLevelValue } from '../models/Assessment'
import { indexDocument, deleteDocument } from '../services/llmService'

export type FormId = string
export type DossierId = string

export interface FormState {
  answers: Answers
  // Per-question source citations for AI-extracted answers (optional: absent
  // in dossiers persisted before this feature existed).
  answerSources?: Record<string, AnswerSourceMeta>
  currentView: string
  completedSections: string[]
  riskLevel: RiskLevelValue
  goDecision: boolean | null
}

export interface DocumentOntology {
  samenvatting?: string
  onderwerpen?: string[]
  entiteiten?: {
    personen?: string[]
    organisaties?: string[]
    systemen?: string[]
    datasoorten?: string[]
  }
  besluiten?: { tekst: string; datum?: string }[]
  openstaande_vragen?: string[]
  relaties?: { van: string; naar: string; type: string }[]
  _parse_error?: boolean
}

export interface SourceDocument {
  id: string
  name: string
  content: string
  uploadedAt: number
  indexing?: boolean
  indexError?: string
  chunkCount?: number
  ontology?: DocumentOntology
}

export interface Dossier {
  id: DossierId
  name: string
  createdAt: number
  sessionId: string
  activeFormId: FormId | null
  forms: Record<FormId, FormState>
  documents: SourceDocument[]
}

function initialFormState(): FormState {
  return {
    answers: {},
    answerSources: {},
    currentView: 'home',
    completedSections: [],
    riskLevel: null,
    goDecision: null,
  }
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function newDossier(name: string): Dossier {
  return {
    id: generateId('d'),
    name,
    createdAt: Date.now(),
    sessionId: generateId('s'),
    activeFormId: null,
    forms: {},
    documents: [],
  }
}

interface StoreState {
  dossiers: Record<DossierId, Dossier>
  dossierOrder: DossierId[]
  activeDossierId: DossierId | null
  // Legacy fields — preserved for one-shot migration from older persisted state
  forms?: Record<FormId, FormState>
  activeFormId?: FormId | null
  documents?: SourceDocument[]
  sessionId?: string
}

export const useAssessmentStore = defineStore('assessment', {
  state: (): StoreState => ({
    dossiers: {},
    dossierOrder: [],
    activeDossierId: null,
  }),

  getters: {
    dossierList(state): Dossier[] {
      return state.dossierOrder.map((id) => state.dossiers[id]).filter(Boolean)
    },
    activeDossier(state): Dossier {
      const d = state.activeDossierId ? state.dossiers[state.activeDossierId] : null
      // Fallback only used before ensureDossier() runs — read-only consumers
      return d ?? { id: '', name: '', createdAt: 0, sessionId: '', activeFormId: null, forms: {}, documents: [] }
    },
    activeFormId(): FormId | null { return this.activeDossier.activeFormId },
    forms(): Record<FormId, FormState> { return this.activeDossier.forms },
    documents(): SourceDocument[] { return this.activeDossier.documents },
    sessionId(): string { return this.activeDossier.sessionId },

    activeForm(): FormState {
      const id = this.activeDossier.activeFormId
      return id ? (this.activeDossier.forms[id] ?? initialFormState()) : initialFormState()
    },
    answers(): Answers { return this.activeForm.answers },
    currentView(): string { return this.activeForm.currentView },
    completedSections(): string[] { return this.activeForm.completedSections },
    riskLevel(): RiskLevelValue { return this.activeForm.riskLevel },
    goDecision(): boolean | null { return this.activeForm.goDecision },
    showPartB(): boolean { return this.activeForm.goDecision === true },

    getAnswer(): (questionId: string) => string | string[] {
      return (questionId: string) => this.activeForm.answers[questionId] ?? ''
    },
    answerSourcesFor(): (questionId: string) => AnswerSourceMeta | undefined {
      return (questionId: string) => this.activeForm.answerSources?.[questionId]
    },
    isSectionCompleted(): (sectionId: string) => boolean {
      return (sectionId: string) => this.activeForm.completedSections.includes(sectionId)
    },
  },

  actions: {
    ensureDossier() {
      // One-shot migration from pre-dossier persisted state
      const legacy = this.$state as StoreState
      if (
        Object.keys(this.dossiers).length === 0 &&
        (legacy.forms || legacy.documents || legacy.sessionId)
      ) {
        const d = newDossier('Dossier 1')
        if (legacy.sessionId) d.sessionId = legacy.sessionId
        if (legacy.forms) d.forms = legacy.forms
        if (legacy.activeFormId) d.activeFormId = legacy.activeFormId
        if (legacy.documents) d.documents = legacy.documents
        this.dossiers[d.id] = d
        this.dossierOrder.push(d.id)
        this.activeDossierId = d.id
        delete legacy.forms
        delete legacy.activeFormId
        delete legacy.documents
        delete legacy.sessionId
      }
      if (Object.keys(this.dossiers).length === 0) {
        const d = newDossier('Dossier 1')
        this.dossiers[d.id] = d
        this.dossierOrder.push(d.id)
        this.activeDossierId = d.id
      }
      if (!this.activeDossierId || !this.dossiers[this.activeDossierId]) {
        this.activeDossierId = this.dossierOrder[0] ?? null
      }
    },

    createDossier(name?: string): DossierId {
      const trimmed = (name ?? '').trim() || `Dossier ${this.dossierOrder.length + 1}`
      const d = newDossier(trimmed)
      this.dossiers[d.id] = d
      this.dossierOrder.push(d.id)
      this.activeDossierId = d.id
      return d.id
    },

    switchDossier(id: DossierId) {
      if (this.dossiers[id]) this.activeDossierId = id
    },

    renameDossier(id: DossierId, name: string) {
      const trimmed = name.trim()
      if (this.dossiers[id] && trimmed) this.dossiers[id].name = trimmed
    },

    deleteDossier(id: DossierId) {
      const dossier = this.dossiers[id]
      if (!dossier) return
      // Best-effort cleanup of indexed documents on the backend
      for (const doc of dossier.documents) {
        deleteDocument(doc.id).catch(() => {})
      }
      delete this.dossiers[id]
      this.dossierOrder = this.dossierOrder.filter((x) => x !== id)
      if (this.activeDossierId === id) {
        this.activeDossierId = this.dossierOrder[0] ?? null
      }
      if (!this.activeDossierId) this.ensureDossier()
    },

    setActiveForm(id: FormId) {
      this.ensureDossier()
      const dossier = this.dossiers[this.activeDossierId!]
      if (!dossier.forms[id]) dossier.forms[id] = initialFormState()
      dossier.activeFormId = id
    },

    setAnswer(questionId: string, value: string | string[]) {
      const f = this.currentFormMutable()
      if (f) f.answers[questionId] = value
    },

    setCurrentView(view: string) {
      const f = this.currentFormMutable()
      if (f) f.currentView = view
    },

    setRiskLevel(level: RiskLevelValue) {
      const f = this.currentFormMutable()
      if (f) f.riskLevel = level
    },

    setGoDecision(decision: boolean) {
      const f = this.currentFormMutable()
      if (f) f.goDecision = decision
    },

    markSectionCompleted(sectionId: string) {
      const f = this.currentFormMutable()
      if (f && !f.completedSections.includes(sectionId)) {
        f.completedSections.push(sectionId)
      }
    },

    currentFormMutable(): FormState | null {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier || !dossier.activeFormId) return null
      return dossier.forms[dossier.activeFormId] ?? null
    },

    goToPortal() {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (dossier) dossier.activeFormId = null
    },

    resetActive() {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (dossier?.activeFormId) dossier.forms[dossier.activeFormId] = initialFormState()
    },

    reset() {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier) return
      for (const id of Object.keys(dossier.forms)) {
        dossier.forms[id] = initialFormState()
      }
    },

    async addDocument(name: string, content: string): Promise<SourceDocument> {
      this.ensureDossier()
      const dossier = this.dossiers[this.activeDossierId!]
      const doc: SourceDocument = {
        id: generateId('doc'),
        name,
        content,
        uploadedAt: Date.now(),
        indexing: true,
      }
      dossier.documents.push(doc)

      try {
        const res = await indexDocument({
          sessionId: dossier.sessionId,
          docId: doc.id,
          name,
          content,
        })
        const stored = dossier.documents.find((d) => d.id === doc.id)
        if (stored) {
          stored.indexing = false
          stored.chunkCount = res.chunkCount
          stored.ontology = res.ontology
        }
      } catch (e) {
        const stored = dossier.documents.find((d) => d.id === doc.id)
        if (stored) {
          stored.indexing = false
          stored.indexError = e instanceof Error ? e.message : String(e)
        }
      }
      return doc
    },

    setAnswerForForm(formId: string, questionId: string, value: string | string[]) {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier) return
      if (!dossier.forms[formId]) dossier.forms[formId] = initialFormState()
      dossier.forms[formId].answers[questionId] = value
    },

    setAnswerSourcesForForm(formId: string, questionId: string, meta: AnswerSourceMeta) {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier) return
      if (!dossier.forms[formId]) dossier.forms[formId] = initialFormState()
      const form = dossier.forms[formId]
      if (!form.answerSources) form.answerSources = {}
      form.answerSources[questionId] = meta
    },

    setAnswerSources(questionId: string, meta: AnswerSourceMeta) {
      const id = this.activeDossier.activeFormId
      if (id) this.setAnswerSourcesForForm(id, questionId, meta)
    },

    // The user touched the answer: the hallucination warning is no longer
    // relevant, but the citations remain useful.
    dismissSourceWarning(questionId: string) {
      const meta = this.currentFormMutable()?.answerSources?.[questionId]
      if (meta) meta.grounded = true
    },

    async removeDocument(id: string) {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier) return
      dossier.documents = dossier.documents.filter((d) => d.id !== id)
      try {
        await deleteDocument(id)
      } catch {
        // best-effort; UI removal already happened
      }
    },
  },

  persist: true,
})
