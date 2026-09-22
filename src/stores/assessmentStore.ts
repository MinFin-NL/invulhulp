import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Answers, AnswerSourceMeta, QuestionAttachment, RiskLevelValue } from '../models/Assessment'
import {
  indexDocument,
  uploadPdfDocument,
  deleteDocument,
  deleteImage,
  listDocuments,
} from '../services/llmService'
import {
  DossierApiError,
  deleteDossierOnServer,
  fetchDossiers,
  saveDossier,
  type DossierRole,
  type ServerDossier,
} from '../services/dossierService'
import { getCachedForm, flattenFormQuestions } from '../services/formLoader'
import { DossierDoc, SEED_ORIGIN } from '../collab/dossierDoc'
import {
  connectDossier,
  disconnectAll,
  getProvider,
  purgeDossierLocalState,
} from '../collab/dossierTransport'
import type { DossierPayload } from '../collab/ydocCodec'
import { BESLISHULP_HOST_FORM_ID, riskLevelFor, type BeslishulpRun } from '../utils/beslishulp'
import {
  TOEPASSINGSSCAN_HOST_FORM_ID,
  deriveKenmerken,
  type Kenmerken,
  type ToepassingsscanRun,
} from '../utils/toepassingsscan'

export type FormId = string
export type DossierId = string

export interface FormState {
  answers: Answers
  // Per-question source citations for AI-extracted answers (optional: absent
  // in dossiers persisted before this feature existed).
  answerSources?: Record<string, AnswerSourceMeta>
  // Per-question image attachments (metadata only — bytes live on the backend).
  // Optional: absent in dossiers persisted before this feature existed.
  attachments?: Record<string, QuestionAttachment[]>
  currentView: string
  completedSections: string[]
  riskLevel: RiskLevelValue
  goDecision: boolean | null
  // The Beslishulp AI-verordening run for this dossier. Only ever set on
  // BESLISHULP_HOST_FORM_ID — see the comment there for why it hangs off a form.
  // Optional: absent in dossiers persisted before this feature existed.
  beslishulp?: BeslishulpRun
  // The dossier's toepassingsscan. Only ever set on TOEPASSINGSSCAN_HOST_FORM_ID
  // — same host-form trick as `beslishulp` above, for the same reason.
  toepassingsscan?: ToepassingsscanRun
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
  // Absent in dossiers persisted before this field existed — display falls
  // back to createdAt.
  updatedAt?: number
  sessionId: string
  activeFormId: FormId | null
  forms: Record<FormId, FormState>
  documents: SourceDocument[]
  // Sharing metadata from the server. Absent on dossiers that never synced
  // (old persisted state, offline) — those are treated as fully owned.
  myRole?: DossierRole
  ownerName?: string
  sharedWithMe?: boolean
}

/** Top-level screen: the dossier overview or a single dossier (whose own
 *  activeFormId decides between the detail page and an open form). */
export type Screen = 'dossierList' | 'dossier'

function initialFormState(): FormState {
  return {
    answers: {},
    answerSources: {},
    attachments: {},
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

// Debounce timers for the server push, keyed by dossier id. Module scope on
// purpose: timers must never end up in the persisted state.
const pushTimers = new Map<DossierId, ReturnType<typeof setTimeout>>()
const PUSH_DEBOUNCE_MS = 1500

/**
 * Whether the user's work has reached the server. Module scope for the same
 * reason as pushTimers: this is live session state and must never be persisted
 * — a restored "bezig met opslaan" would be a lie about a request that died
 * with the previous tab.
 *
 * One status for the app, not one per dossier: only the dossier the user is
 * editing pushes, so a per-dossier map would carry a distinction nothing can
 * observe. 'pending' covers the debounce window, 'saving' the request itself.
 */
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'
export const saveStatus = ref<SaveStatus>('idle')
export const lastSavedAt = ref<number | null>(null)

// One live CRDT doc per dossier — the source of truth for a dossier's shared
// CONTENT (answers, sources, attachments, risk/go/sections) while it's in
// memory. Content mutators write through the doc; its onChange mirrors the
// merged content back into Pinia. Per-user navigation (activeFormId,
// currentView) and server-owned fields (documents, sharing) stay in Pinia and
// are never touched by the mirror. Module scope so docs never get persisted.
// Phase 2 attaches WebSocket transport to these same docs.
const dossierDocs = new Map<DossierId, DossierDoc>()

// Question types whose answer is an option label, not prose: stored verbatim in
// the CRDT so it survives byte-equal (see DossierDoc.setAnswer's `opaque`).
// Types per loaded form, so a radio answer doesn't re-walk the form on every
// keystroke. Falls back to "prose" when the form isn't loaded yet — the caller
// that fills answers for another form loads it first, so this only misses for a
// form nothing has opened, where no radio can have been clicked either.
const choiceTypes = new Map<string, Set<string>>()
function isChoiceQuestion(formId: string, questionId: string): boolean {
  let ids = choiceTypes.get(formId)
  if (!ids) {
    const form = getCachedForm(formId)
    if (!form) return false
    ids = new Set(flattenFormQuestions(form).filter((q) => q.type === 'radio').map((q) => q.id))
    choiceTypes.set(formId, ids)
  }
  return ids.has(questionId)
}

/** The collab-synced envelope for one dossier (drops documents/sharing). */
function payloadOf(d: Dossier): DossierPayload {
  return {
    id: d.id,
    name: d.name,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    sessionId: d.sessionId,
    activeFormId: d.activeFormId,
    forms: d.forms,
  }
}

// While the server dossier list is loading, ensureDossier() must not
// auto-create anything: a user whose only dossiers are shared ones would get
// a spurious empty "Dossier 1" that then syncs to the server.
let serverLoadPending = false

interface StoreState {
  dossiers: Record<DossierId, Dossier>
  dossierOrder: DossierId[]
  activeDossierId: DossierId | null
  screen: Screen
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
    // Default doubles as migration: state persisted before this field existed
    // lands on the dossier overview.
    screen: 'dossierList',
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

    /** The dossier's Beslishulp AI-verordening run, wherever it is stored.
     *  The single read path — see BESLISHULP_HOST_FORM_ID. */
    beslishulpRun(): BeslishulpRun | null {
      return this.activeDossier.forms[BESLISHULP_HOST_FORM_ID]?.beslishulp ?? null
    },

    /** The dossier's toepassingsscan — the single read path, mirroring
     *  beslishulpRun. See TOEPASSINGSSCAN_HOST_FORM_ID. */
    toepassingsscanRun(): ToepassingsscanRun | null {
      return this.activeDossier.forms[TOEPASSINGSSCAN_HOST_FORM_ID]?.toepassingsscan ?? null
    },

    /**
     * What this dossier *has*, derived live from the scan answers and the
     * beslishulp conclusion. Null until a scan has been run — callers must
     * treat that as "unknown", never as "nothing applies".
     *
     * Recomputed rather than read from the stored snapshot so a beslishulp run
     * after the scan updates `ai_verordening_in_scope` without re-answering.
     */
    kenmerken(): Kenmerken | null {
      const run = this.toepassingsscanRun
      return run ? deriveKenmerken(run.answers, this.beslishulpRun) : null
    },
    showPartB(): boolean { return this.activeForm.goDecision === true },

    getAnswer(): (questionId: string) => string | string[] {
      return (questionId: string) => this.activeForm.answers[questionId] ?? ''
    },
    answerSourcesFor(): (questionId: string) => AnswerSourceMeta | undefined {
      return (questionId: string) => this.activeForm.answerSources?.[questionId]
    },
    attachmentsFor(): (questionId: string) => QuestionAttachment[] {
      return (questionId: string) => this.activeForm.attachments?.[questionId] ?? []
    },
    isSectionCompleted(): (sectionId: string) => boolean {
      return (sectionId: string) => this.activeForm.completedSections.includes(sectionId)
    },

    // Sharing roles: a dossier without myRole never synced to the server and
    // is fully the user's own — treat as owner.
    canEdit(): boolean {
      const role = this.activeDossier.myRole
      return role === undefined || role !== 'viewer'
    },
    isOwner(): boolean {
      const role = this.activeDossier.myRole
      return role === undefined || role === 'owner'
    },
    readOnly(): boolean {
      return !this.canEdit
    },
  },

  actions: {
    /** Mark that a server load is imminent, so ensureDossier() won't auto-create
     *  a spurious empty dossier before shared/other-device dossiers arrive.
     *  Call synchronously (App setup) before any child mounts — child onMounted
     *  (DossierList/DossierDetail) runs before the parent's, and dev-auth renders
     *  the list immediately. loadFromServer clears the flag in its finally. */
    beginServerLoad() {
      serverLoadPending = true
    },

    ensureDossier() {
      if (serverLoadPending) return
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

    /** Stamp a dossier as edited; drives "Laatst bewerkt" on the overview.
     *  Only content mutations call this — navigating is not an edit. This is
     *  the single funnel for content changes, so it also schedules the
     *  debounced push to the server. */
    touch(id?: DossierId | null) {
      const d = (id ?? this.activeDossierId) ? this.dossiers[(id ?? this.activeDossierId)!] : null
      if (d) {
        d.updatedAt = Date.now()
        this.schedulePush(d.id)
      }
    },

    /** Debounced best-effort push of one dossier to the server. Viewers never
     *  push (the server would reject with 403 anyway). */
    schedulePush(id: DossierId) {
      const dossier = this.dossiers[id]
      if (!dossier || dossier.myRole === 'viewer') return
      const existing = pushTimers.get(id)
      if (existing) clearTimeout(existing)
      saveStatus.value = 'pending'
      pushTimers.set(
        id,
        setTimeout(() => {
          pushTimers.delete(id)
          const d = this.dossiers[id]
          if (!d) return
          saveStatus.value = 'saving'
          saveDossier({
            id: d.id,
            name: d.name,
            createdAt: d.createdAt,
            updatedAt: d.updatedAt,
            sessionId: d.sessionId,
            activeFormId: d.activeFormId,
            forms: d.forms,
          })
            .then(() => {
              // A newer edit already re-armed the timer: don't overwrite its
              // 'pending' with a 'saved' that describes the previous push.
              if (pushTimers.has(id)) return
              lastSavedAt.value = Date.now()
              saveStatus.value = 'saved'
            })
            .catch(() => {
              // offline or denied — localStorage keeps the state, next edit retries
              if (pushTimers.has(id)) return
              saveStatus.value = 'error'
            })
        }, PUSH_DEBOUNCE_MS),
      )
    },

    /** Load the user's dossiers (own + shared) from the server and merge them
     *  into local state. Call once after login, before ensureDossier(). */
    async loadFromServer() {
      serverLoadPending = true
      let serverDossiers: ServerDossier[]
      try {
        serverDossiers = await fetchDossiers()
      } catch {
        return // offline or older backend — keep localStorage state
      } finally {
        serverLoadPending = false
      }
      const serverById = new Map(serverDossiers.map((d) => [d.id, d]))

      // Server load rewrites Pinia forms below; drop live docs + their
      // transport so they re-seed from the merged result and reconnect on the
      // next edit.
      disconnectAll()
      dossierDocs.clear()

      // Drop local dossiers that synced before but are now denied/gone: the
      // localStorage cache is per-browser, not per-user, so this is either a
      // revoked share or another account's cache. Never re-push those.
      for (const id of [...this.dossierOrder]) {
        const local = this.dossiers[id]
        if (local?.myRole !== undefined && !serverById.has(id)) {
          delete this.dossiers[id]
          this.dossierOrder = this.dossierOrder.filter((x) => x !== id)
        }
      }

      for (const server of serverDossiers) {
        const local = this.dossiers[server.id]
        if (!local) {
          // New to this browser (shared with me, or made on another device)
          this.dossiers[server.id] = {
            id: server.id,
            name: server.name,
            createdAt: server.createdAt,
            updatedAt: server.updatedAt,
            sessionId: server.sessionId,
            activeFormId: null,
            forms: server.forms ?? {},
            documents: [],
            myRole: server.myRole,
            ownerName: server.ownerName ?? undefined,
            sharedWithMe: server.sharedWithMe,
          }
          this.dossierOrder.push(server.id)
          continue
        }
        // Known locally: server wins unless the local copy is strictly newer
        // (offline edits) — then keep local content and push it back.
        if ((server.updatedAt ?? 0) >= (local.updatedAt ?? 0)) {
          local.name = server.name
          local.forms = server.forms ?? {}
          local.updatedAt = server.updatedAt
        } else {
          this.schedulePush(local.id)
        }
        local.sessionId = server.sessionId
        local.myRole = server.myRole
        local.ownerName = server.ownerName ?? undefined
        local.sharedWithMe = server.sharedWithMe
      }

      // Migration: local dossiers the server has never seen (pre-sharing
      // localStorage state). Skip pristine empty ones to avoid junk records.
      for (const id of this.dossierOrder) {
        const local = this.dossiers[id]
        if (!local || local.myRole !== undefined || serverById.has(id)) continue
        const pristine = Object.keys(local.forms).length === 0 && local.documents.length === 0
        if (pristine) continue
        this.schedulePush(id)
      }

      if (this.activeDossierId && !this.dossiers[this.activeDossierId]) {
        this.activeDossierId = this.dossierOrder[0] ?? null
      }
    },

    createDossier(name?: string): DossierId {
      const trimmed = (name ?? '').trim() || `Dossier ${this.dossierOrder.length + 1}`
      const d = newDossier(trimmed)
      this.dossiers[d.id] = d
      this.dossierOrder.push(d.id)
      this.activeDossierId = d.id
      this.screen = 'dossier'
      this.schedulePush(d.id)
      return d.id
    },

    goToDossierList() {
      this.screen = 'dossierList'
    },

    /** Verplaats een dossier in het overzicht. De indices zijn die van
     *  `dossierList` — de zichtbare lijst — niet van `dossierOrder`: die kan
     *  id's bevatten waar geen dossier (meer) bij hoort. Het opnieuw schrijven
     *  van `dossierOrder` ruimt die meteen op.
     *
     *  De volgorde is een weergavevoorkeur en blijft lokaal: hij gaat mee in
     *  de gepersisteerde Pinia-state, niet naar de server. Een gedeeld dossier
     *  staat bij een collega dus op diens eigen plek. */
    moveDossier(fromIndex: number, toIndex: number) {
      const ids = this.dossierList.map((d) => d.id)
      if (fromIndex === toIndex) return
      if (fromIndex < 0 || fromIndex >= ids.length) return
      if (toIndex < 0 || toIndex >= ids.length) return
      const [id] = ids.splice(fromIndex, 1)
      ids.splice(toIndex, 0, id)
      this.dossierOrder = ids
    },

    /** Open a dossier's detail page from the overview. Always lands on the
     *  detail page, never on a stale open form. */
    openDossier(id: DossierId) {
      const dossier = this.dossiers[id]
      if (!dossier) return
      this.activeDossierId = id
      dossier.activeFormId = null
      this.screen = 'dossier'
      this.syncDocumentsFromServer()
    },

    /** Merge documents the backend has persisted for the active dossier into
     *  local state — restores uploads after a wiped localStorage or on a new
     *  device. Local documents are never removed; best-effort (an older
     *  backend without the endpoint just leaves local state as-is). */
    async syncDocumentsFromServer() {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier) return
      try {
        const serverDocs = await listDocuments(dossier.sessionId)
        for (const d of serverDocs) {
          if (dossier.documents.some((local) => local.id === d.doc_id)) continue
          dossier.documents.push({
            id: d.doc_id,
            name: d.name,
            content: d.content,
            uploadedAt: d.uploaded_at ?? Date.now(),
            chunkCount: d.chunk_count,
            ontology: d.ontology as DocumentOntology,
          })
        }
      } catch {
        // offline or older backend — keep local state
      }
    },

    renameDossier(id: DossierId, name: string) {
      const trimmed = name.trim()
      if (this.dossiers[id] && trimmed) {
        this.dossiers[id].name = trimmed
        this.touch(id)
      }
    },

    /** Delete a dossier and everything under it. Owner-only; the server is the
     *  authority, so a refusal (403) throws and the dossier stays put — removing
     *  it locally would only make it reappear on the next sync. A network
     *  failure still deletes locally: offline the server cascade catches up via
     *  the same call on the next attempt. */
    async deleteDossier(id: DossierId) {
      const dossier = this.dossiers[id]
      if (!dossier) return
      const timer = pushTimers.get(id)
      if (timer) {
        clearTimeout(timer)
        pushTimers.delete(id)
      }
      try {
        // The dossier record cascade removes the documents, images, vector
        // chunks and collaboration state on the server too.
        await deleteDossierOnServer(id)
      } catch (e) {
        if (e instanceof DossierApiError) {
          // Re-arm nothing: the dossier is untouched, the caller reports why.
          throw e
        }
        // Offline/unreachable — fall through and clean up locally.
      }
      // Drop the live connection and the offline CRDT copy, otherwise the
      // dossier's answers stay readable in IndexedDB after "verwijderen".
      void purgeDossierLocalState(id)
      dossierDocs.get(id)?.destroy()
      dossierDocs.delete(id)
      delete this.dossiers[id]
      this.dossierOrder = this.dossierOrder.filter((x) => x !== id)
      if (this.activeDossierId === id) {
        this.activeDossierId = this.dossierOrder[0] ?? null
      }
      if (!this.activeDossierId) this.ensureDossier()
    },

    /** Apply several answer mutations to one dossier as a single atomic doc
     *  transaction — collaborators see them land together and it's one undo step
     *  (e.g. an AI Modus smoothing undo restoring many answers at once). The
     *  mirror + server push fire once for the whole batch. */
    batchAnswers(dossierId: DossierId, fn: () => void) {
      const doc = this._docFor(dossierId)
      if (doc) doc.transact(fn)
      else fn()
    },

    /** The shared top-level Y.XmlFragment for a rich-text answer in the active
     *  form — what a collaborative Tiptap editor binds to. Null off a dossier. */
    textFragmentFor(questionId: string) {
      const id = this.activeDossierId
      const formId = this.activeDossier.activeFormId
      if (!id || !formId) return null
      return this._docFor(id)?.textFragment(formId, questionId) ?? null
    },

    setActiveForm(id: FormId) {
      this.ensureDossier()
      const dossier = this.dossiers[this.activeDossierId!]
      if (!dossier.forms[id]) dossier.forms[id] = initialFormState()
      dossier.activeFormId = id
      this.screen = 'dossier'
      // Open the live doc now (connect + seed) so edits sync even before this
      // user types — otherwise a reader would never receive collaborators' edits.
      this._docFor(dossier.id)
    },

    setAnswer(questionId: string, value: string | string[]) {
      const formId = this.activeDossier.activeFormId
      if (formId) this.setAnswerForForm(formId, questionId, value)
    },

    setCurrentView(view: string) {
      const f = this.currentFormMutable()
      if (f) f.currentView = view
    },

    setRiskLevel(level: RiskLevelValue) {
      const formId = this.activeDossier.activeFormId
      if (formId) this.setRiskLevelForForm(formId, level)
    },

    /** Risk level of a named form — needed for forms that aren't the open one
     *  (the beslishulp runs from the dossier page, with no form open at all). */
    setRiskLevelForForm(formId: FormId, level: RiskLevelValue) {
      const id = this.activeDossierId
      if (!id) return
      if (!this.dossiers[id]?.forms[formId]) this.dossiers[id].forms[formId] = initialFormState()
      this._docFor(id)?.setRiskLevel(formId, level)
    },

    /** Record (or clear, with null) the dossier's beslishulp run and mirror its
     *  verdict onto the host form's risk level. Other forms adopt that verdict
     *  explicitly — see the AIIA risk view — rather than having it pushed at them. */
    setBeslishulpRun(run: BeslishulpRun | null) {
      const id = this.activeDossierId
      if (!id) return
      const formId = BESLISHULP_HOST_FORM_ID
      if (!this.dossiers[id].forms[formId]) this.dossiers[id].forms[formId] = initialFormState()
      this._docFor(id)?.setBeslishulp(formId, run)
      this.setRiskLevelForForm(formId, run ? riskLevelFor(new Set(run.labels)) : null)
    },

    /** Record (or clear, with null) the dossier's toepassingsscan. */
    setToepassingsscanRun(run: ToepassingsscanRun | null) {
      const id = this.activeDossierId
      if (!id) return
      const formId = TOEPASSINGSSCAN_HOST_FORM_ID
      if (!this.dossiers[id].forms[formId]) this.dossiers[id].forms[formId] = initialFormState()
      this._docFor(id)?.setToepassingsscan(formId, run)
    },

    setGoDecision(decision: boolean) {
      const id = this.activeDossierId
      const formId = this.activeDossier.activeFormId
      if (id && formId) this._docFor(id)?.setGoDecision(formId, decision)
    },

    markSectionCompleted(sectionId: string) {
      const id = this.activeDossierId
      const formId = this.activeDossier.activeFormId
      if (id && formId) this._docFor(id)?.markSectionCompleted(formId, sectionId)
    },

    currentFormMutable(): FormState | null {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier || !dossier.activeFormId) return null
      return dossier.forms[dossier.activeFormId] ?? null
    },

    /** The live CRDT doc for a dossier, created (and seeded from current Pinia
     *  state) on first use. Content mutators route through it; its onChange
     *  merges shared content back into Pinia and schedules persistence. */
    _docFor(dossierId: DossierId): DossierDoc | null {
      const dossier = this.dossiers[dossierId]
      if (!dossier) return null
      const existing = dossierDocs.get(dossierId)
      if (existing) return existing

      // Empty doc: it's seeded either from the room (a peer already opened it)
      // or, if the room is empty, from our own JSON — the seed-once pattern that
      // avoids two peers independently building (and duplicating) the tree.
      const doc = new DossierDoc()
      // onChange fires for the seed, local edits, and synced remote merges.
      doc.onChange((payload, origin) => {
        const d = this.dossiers[payload.id]
        if (!d) return
        // Merge ONLY shared content into Pinia, per form. currentView is
        // per-user view state and is deliberately preserved; name/activeFormId
        // and documents/sharing are owned elsewhere and left untouched.
        for (const [fid, incoming] of Object.entries(payload.forms)) {
          const target = d.forms[fid]
          if (!target) {
            d.forms[fid] = incoming
            continue
          }
          target.answers = incoming.answers
          target.answerSources = incoming.answerSources
          target.attachments = incoming.attachments
          target.riskLevel = incoming.riskLevel
          target.goDecision = incoming.goDecision
          target.completedSections = incoming.completedSections
          target.beslishulp = incoming.beslishulp
          target.toepassingsscan = incoming.toepassingsscan
        }
        // Seeding (opening) is not an edit — don't bump updatedAt or persist.
        if (origin === SEED_ORIGIN) return
        // A peer's edit arrives with the provider as its origin. Everything else
        // is a local edit — whether via setAnswer (LOCAL_ORIGIN) or the bound
        // editor typing directly into the fragment (y-prosemirror's own origin).
        // Persist local edits; reflect a peer's edit but let the originator
        // persist it (two clients PUTting the same dossier at once races the file store).
        if (origin === getProvider(payload.id)) {
          d.updatedAt = payload.updatedAt ?? Date.now()
        } else {
          d.updatedAt = Date.now()
          this.schedulePush(d.id)
        }
      })
      dossierDocs.set(dossierId, doc)
      // Viewers don't sync-edit (server rejects them); they read the REST
      // snapshot, so seed locally now. Editors connect and seed-if-empty on sync.
      if (dossier.myRole === 'viewer') {
        doc.seedFrom(payloadOf(dossier))
      } else {
        connectDossier(doc.doc, dossierId, () => {
          doc.seedFrom(payloadOf(dossier))
          // Push once after seeding: any edits made before the (deferred) seed
          // completed were captured in Pinia by the seed's mirror run but under
          // SEED_ORIGIN, which doesn't push. This persists fast typing on open.
          this.schedulePush(dossierId)
        })
      }
      return doc
    },

    /** Back to the active dossier's detail page (closes the open form). */
    goToPortal() {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (dossier) dossier.activeFormId = null
      this.screen = 'dossier'
    },

    resetActive() {
      const id = this.activeDossierId
      const dossier = id ? this.dossiers[id] : null
      if (dossier?.activeFormId) this._docFor(id!)?.resetForm(dossier.activeFormId)
    },

    reset() {
      const id = this.activeDossierId
      const dossier = id ? this.dossiers[id] : null
      if (!dossier) return
      const doc = this._docFor(id!)
      for (const fid of Object.keys(dossier.forms)) doc?.resetForm(fid)
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
      this.touch(dossier.id)

      try {
        const res = await indexDocument({
          sessionId: dossier.sessionId,
          docId: doc.id,
          name,
          content,
          uploadedAt: doc.uploadedAt,
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

    /**
     * Upload a PDF and let the backend extract it. The server does the text
     * extraction here (so tables and figures survive), which means the
     * document only gets its content once the upload returns — unlike
     * addDocument, where the browser already has the text up front.
     * Throws PdfNoTextError for scanned PDFs so the caller can explain why.
     */
    async addPdfDocument(file: File): Promise<SourceDocument> {
      this.ensureDossier()
      const dossier = this.dossiers[this.activeDossierId!]
      const doc: SourceDocument = {
        id: generateId('doc'),
        name: file.name,
        content: '',
        uploadedAt: Date.now(),
        indexing: true,
      }
      dossier.documents.push(doc)
      this.touch(dossier.id)

      try {
        const res = await uploadPdfDocument(file, dossier.sessionId, doc.id, doc.uploadedAt)
        const stored = dossier.documents.find((d) => d.id === doc.id)
        if (stored) {
          stored.indexing = false
          stored.content = res.content
          stored.chunkCount = res.chunkCount
          stored.ontology = res.ontology
        }
      } catch (e) {
        // A failed upload leaves nothing usable behind — drop the placeholder
        // rather than stranding an empty document in the dossier.
        dossier.documents = dossier.documents.filter((d) => d.id !== doc.id)
        this.touch(dossier.id)
        throw e
      }
      return doc
    },

    // The optional dossierId lets long-running writers (AI Modus) keep writing
    // to the dossier they started in, even if the user switched dossiers.
    setAnswerForForm(formId: string, questionId: string, value: string | string[], dossierId?: DossierId) {
      const id = dossierId ?? this.activeDossierId
      if (!id || !this.dossiers[id]) return
      // Through the doc: ensureForm creates the form, the mirror lands it in Pinia.
      this._docFor(id)?.setAnswer(formId, questionId, value, isChoiceQuestion(formId, questionId))
    },

    setAnswerSourcesForForm(formId: string, questionId: string, meta: AnswerSourceMeta, dossierId?: DossierId) {
      const id = dossierId ?? this.activeDossierId
      if (!id || !this.dossiers[id]) return
      this._docFor(id)?.setAnswerSources(formId, questionId, meta)
    },

    /** Smoothing rewrote this answer: keep the citations, but record that they
     *  describe the pre-smoothing text. No-op when there are none. */
    markAnswerSmoothed(formId: string, questionId: string, dossierId?: DossierId) {
      const id = dossierId ?? this.activeDossierId
      if (!id || !this.dossiers[id]) return
      const meta = this.dossiers[id].forms[formId]?.answerSources?.[questionId]
      if (!meta) return
      this._docFor(id)?.setAnswerSources(formId, questionId, { ...meta, smoothedAt: Date.now() })
    },

    setAnswerSources(questionId: string, meta: AnswerSourceMeta) {
      const id = this.activeDossier.activeFormId
      if (id) this.setAnswerSourcesForForm(id, questionId, meta)
    },

    // The user touched the answer: the hallucination warning is no longer
    // relevant, but the citations remain useful.
    dismissSourceWarning(questionId: string) {
      const id = this.activeDossierId
      const formId = this.activeDossier.activeFormId
      if (id && formId) this._docFor(id)?.markGrounded(formId, questionId)
    },

    addAttachment(questionId: string, att: QuestionAttachment) {
      const formId = this.activeDossier.activeFormId
      if (!formId) return
      this.addAttachmentForForm(formId, questionId, att)
    },

    /** Like addAttachment, but pinned to a form and dossier — AI Modus keeps
     *  writing to the dossier its run started in even if the user navigates
     *  away. Re-attaching the same image id is a no-op, so an extracted figure
     *  can't pile up on a question across runs. */
    addAttachmentForForm(
      formId: string,
      questionId: string,
      att: QuestionAttachment,
      dossierId?: DossierId,
    ) {
      const id = dossierId ?? this.activeDossierId
      if (!id || !this.dossiers[id]) return
      const current = this.dossiers[id].forms[formId]?.attachments?.[questionId] ?? []
      if (current.some((a) => a.id === att.id)) return
      this._docFor(id)?.setAttachments(formId, questionId, [...current, att])
    },

    removeAttachment(questionId: string, imageId: string) {
      const id = this.activeDossierId
      const formId = this.activeDossier.activeFormId
      if (!id || !formId) return
      const current = this.currentFormMutable()?.attachments?.[questionId]
      if (!current) return
      const removed = current.find((a) => a.id === imageId)
      const next = current.filter((a) => a.id !== imageId)
      if (!removed) return
      this._docFor(id)?.setAttachments(formId, questionId, next)
      // A figure extracted from a source document is owned by that document,
      // not by this answer: the same image may be attached to another question
      // or re-attached by the next AI Modus run, so only the bytes the user
      // uploaded here are deleted. Document figures go with the dossier.
      if (removed.sourceDocId) return
      // best-effort server cleanup; UI removal already happened
      deleteImage(imageId, this.activeDossier.sessionId).catch(() => {})
    },

    updateAttachmentCaption(questionId: string, imageId: string, caption: string) {
      const id = this.activeDossierId
      const formId = this.activeDossier.activeFormId
      if (!id || !formId) return
      const current = this.currentFormMutable()?.attachments?.[questionId]
      if (!current) return
      const next = current.map((a) => (a.id === imageId ? { ...a, caption } : a))
      this._docFor(id)?.setAttachments(formId, questionId, next)
    },

    async removeDocument(id: string) {
      const dossier = this.activeDossierId ? this.dossiers[this.activeDossierId] : null
      if (!dossier) return
      dossier.documents = dossier.documents.filter((d) => d.id !== id)
      this.touch(dossier.id)
      try {
        await deleteDocument(id, dossier.sessionId)
      } catch {
        // best-effort; UI removal already happened
      }
    },
  },

  persist: true,
})
