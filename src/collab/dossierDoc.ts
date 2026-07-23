/**
 * DossierDoc — the collaborative binding layer (Phase 1, second half).
 *
 * Wraps one dossier's Y.Doc and is the *only* way the app mutates a live
 * dossier: every write goes through here into the CRDT, and `onChange` fires
 * with a freshly decoded snapshot so Pinia can mirror it. This is what makes
 * concurrent edits merge instead of clobbering — the whole point of option 3.
 *
 * Scope note: user *typing* in a rich-text field is NOT funneled through
 * setAnswer (that would replace the whole fragment per keystroke and defeat
 * character-level merge). In Phase 3 the Tiptap Collaboration extension binds
 * directly to the Y.XmlFragment. setAnswer's rich-text path is for *programmatic*
 * whole-answer writes — AI Modus bulk-fill, cross-form copy, import — where a
 * whole-value replacement is exactly what's intended.
 */
import * as Y from 'yjs'
import {
  DOSSIER_KEY,
  FORMS_KEY,
  FORM_TEXT,
  FORM_LIST,
  FORM_RAW,
  FORM_META,
  dossierToYDoc,
  getTextFragment,
  isDocSeeded,
  isOpaqueString,
  newFormMap,
  seedDoc,
  writeTextFragment,
  yDocToDossier,
  type DossierPayload,
} from './ydocCodec'
import type { AnswerSourceMeta, QuestionAttachment, RiskLevelValue } from '../models/Assessment'

/** Transaction origin tag for edits made through this wrapper, so `onChange`
 *  can tell a local edit from a synced remote one. */
export const LOCAL_ORIGIN = Symbol('dossier-local')
/** Origin tag for the initial seed (first peer into an empty room). Distinct
 *  from LOCAL_ORIGIN so the store doesn't treat opening a dossier as an edit
 *  (no updatedAt bump, no push). */
export const SEED_ORIGIN = Symbol('dossier-seed')

export type ChangeListener = (payload: DossierPayload, origin: unknown) => void

export class DossierDoc {
  readonly doc: Y.Doc

  constructor(doc?: Y.Doc) {
    this.doc = doc ?? new Y.Doc()
  }

  /** A live doc populated from a stored dossier (local, no-transport path). */
  static fromPayload(payload: DossierPayload): DossierDoc {
    return new DossierDoc(dossierToYDoc(payload))
  }

  /** True once the doc has been seeded (its `forms` map exists). */
  get seeded(): boolean {
    return isDocSeeded(this.doc)
  }

  /** Seed from stored JSON iff not already seeded — the first peer into an
   *  empty collab room. Tagged SEED_ORIGIN so opening isn't treated as an edit. */
  seedFrom(payload: DossierPayload): void {
    seedDoc(this.doc, payload, SEED_ORIGIN)
  }

  /** Current state as the plain JSON envelope (for Pinia, persistence, export). */
  toPayload(): DossierPayload {
    return yDocToDossier(this.doc)
  }

  // --- structural accessors -------------------------------------------------

  private root(): Y.Map<unknown> {
    return this.doc.getMap(DOSSIER_KEY)
  }

  /** Get the form's Y.Map, creating the forms map and/or the form itself if
   *  absent. Tolerates an unseeded doc: a bound editor may need a text answer's
   *  form before the (deferred) seed runs. The additive seed fills the rest. */
  private ensureForm(formId: string): Y.Map<unknown> {
    let forms = this.root().get(FORMS_KEY) as Y.Map<Y.Map<unknown>> | undefined
    if (!forms) {
      this.doc.transact(() => {
        forms = new Y.Map<Y.Map<unknown>>()
        this.root().set(FORMS_KEY, forms)
      }, LOCAL_ORIGIN)
    }
    let f = forms!.get(formId)
    if (!f) {
      this.doc.transact(() => {
        f = newFormMap()
        forms!.set(formId, f)
      }, LOCAL_ORIGIN)
    }
    return f as Y.Map<unknown>
  }

  // --- mutations (all through the doc, tagged LOCAL_ORIGIN) ------------------

  /** Run several mutations as ONE local transaction. Nested setAnswer() calls
   *  coalesce into this outer transaction, so peers see the whole batch land
   *  together, it's a single undo step, and the mirror fires once. */
  transact(fn: () => void): void {
    this.doc.transact(fn, LOCAL_ORIGIN)
  }

  /** Set a whole answer, dispatching to the right CRDT bucket by value shape —
   *  mirrors assessmentStore.setAnswerForForm. Creates the form if needed. */
  setAnswer(formId: string, questionId: string, value: string | string[]): void {
    const f = this.ensureForm(formId)
    const text = f.get(FORM_TEXT) as Y.Map<number>
    const list = f.get(FORM_LIST) as Y.Map<Y.Array<string>>
    const raw = f.get(FORM_RAW) as Y.Map<string>

    this.doc.transact(() => {
      if (Array.isArray(value)) {
        // Checkbox. Clear any stale entry in the other buckets (type changed).
        text.delete(questionId)
        raw.delete(questionId)
        let arr = list.get(questionId)
        if (!arr) {
          arr = new Y.Array<string>()
          list.set(questionId, arr)
        }
        arr.delete(0, arr.length)
        arr.push([...value])
      } else if (isOpaqueString(value)) {
        // Table / opaque JSON string — stored whole (v1 last-write-wins).
        text.delete(questionId)
        list.delete(questionId)
        raw.set(questionId, value)
      } else {
        // Rich text — diff into the shared top-level fragment (a bound editor
        // keeps its identity and sees a minimal delta). Index it in FORM_TEXT.
        list.delete(questionId)
        raw.delete(questionId)
        text.set(questionId, 1)
        writeTextFragment(getTextFragment(this.doc, formId, questionId), value)
      }
    }, LOCAL_ORIGIN)
  }

  /** The shared top-level rich-text fragment for one answer — what a Tiptap
   *  Collaboration editor binds to. Ensures the form + text index exist so the
   *  answer round-trips through the codec even before anything is typed. */
  textFragment(formId: string, questionId: string): Y.XmlFragment {
    const text = this.ensureForm(formId).get(FORM_TEXT) as Y.Map<number>
    if (text.get(questionId) === undefined) {
      this.doc.transact(() => text.set(questionId, 1), LOCAL_ORIGIN)
    }
    return getTextFragment(this.doc, formId, questionId)
  }

  private setMeta(formId: string, key: string, value: unknown): void {
    const meta = this.ensureForm(formId).get(FORM_META) as Y.Map<unknown>
    this.doc.transact(() => meta.set(key, value), LOCAL_ORIGIN)
  }

  /** Replace one question's answer-source citation metadata. */
  setAnswerSources(formId: string, questionId: string, value: AnswerSourceMeta): void {
    const meta = this.ensureForm(formId).get(FORM_META) as Y.Map<unknown>
    const current = { ...((meta.get('answerSources') as Record<string, AnswerSourceMeta>) ?? {}) }
    current[questionId] = value
    this.setMeta(formId, 'answerSources', current)
  }

  /** Clear the hallucination warning on a question (grounded -> true), keeping
   *  its citations. No-op if there's no source metadata. */
  markGrounded(formId: string, questionId: string): void {
    const meta = this.ensureForm(formId).get(FORM_META) as Y.Map<unknown>
    const sources = (meta.get('answerSources') as Record<string, AnswerSourceMeta>) ?? {}
    const existing = sources[questionId]
    if (!existing || existing.grounded) return
    this.setAnswerSources(formId, questionId, { ...existing, grounded: true })
  }

  /** Replace one question's attachment list (add/remove/caption all funnel here). */
  setAttachments(formId: string, questionId: string, list: QuestionAttachment[]): void {
    const meta = this.ensureForm(formId).get(FORM_META) as Y.Map<unknown>
    const current = { ...((meta.get('attachments') as Record<string, QuestionAttachment[]>) ?? {}) }
    current[questionId] = list
    this.setMeta(formId, 'attachments', current)
  }

  setRiskLevel(formId: string, level: RiskLevelValue): void {
    this.setMeta(formId, 'riskLevel', level)
  }

  setGoDecision(formId: string, decision: boolean | null): void {
    this.setMeta(formId, 'goDecision', decision)
  }

  setCurrentView(formId: string, view: string): void {
    this.setMeta(formId, 'currentView', view)
  }

  /** Add a section id to completedSections (idempotent), mirroring the store. */
  markSectionCompleted(formId: string, sectionId: string): void {
    const meta = this.ensureForm(formId).get(FORM_META) as Y.Map<unknown>
    const current = (meta.get('completedSections') as string[] | undefined) ?? []
    if (current.includes(sectionId)) return
    this.setMeta(formId, 'completedSections', [...current, sectionId])
  }

  /** Reset a form to blank (all buckets emptied), mirroring initialFormState. */
  resetForm(formId: string): void {
    const forms = this.root().get(FORMS_KEY) as Y.Map<Y.Map<unknown>>
    this.doc.transact(() => {
      forms.set(formId, newFormMap())
    }, LOCAL_ORIGIN)
  }

  /** Which form the dossier has open. Part of the synced envelope. */
  setActiveFormId(formId: string | null): void {
    this.doc.transact(() => this.root().set('activeFormId', formId), LOCAL_ORIGIN)
  }

  // --- observation & sync ---------------------------------------------------

  /** Fire `listener` after every change (local, seed, or synced remote), with a
   *  fresh snapshot and the transaction origin. Skips updates that arrive before
   *  the doc is seeded (a snapshot would have no forms). Returns an unsubscribe. */
  onChange(listener: ChangeListener): () => void {
    const handler = (_update: Uint8Array, origin: unknown) => {
      if (!this.seeded) return
      listener(this.toPayload(), origin)
    }
    this.doc.on('update', handler)
    return () => this.doc.off('update', handler)
  }

  /** Full state as a Yjs update, to seed a peer (server -> client, client sync). */
  encodeState(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc)
  }

  /** Merge a remote update in. Tagged non-local so `onChange` reports isLocal=false. */
  applyUpdate(update: Uint8Array, origin: unknown = 'remote'): void {
    Y.applyUpdate(this.doc, update, origin)
  }

  destroy(): void {
    this.doc.destroy()
  }
}
