/**
 * Snapshot codec — Phase 1 of the real-time collaboration plan
 * (docs/realtime-collab-plan.md).
 *
 * The single seam between the CRDT layer (a Y.Doc, the live source of truth for
 * an open dossier) and the JSON envelope every downstream reader depends on:
 * PDF/Word/JSON exports, RAG indexing, the LLM pipeline, and
 * dossierstore.save_dossier on the backend.
 *
 * ydocCodec.test.ts is the executable spec. Do not weaken the test to fit this
 * file.
 *
 * Answer representation in the Y.Doc (per form):
 *   - Rich text  -> Y.XmlFragment  (character-level collaborative, via y-prosemirror)
 *   - Checkbox   -> Y.Array<string>
 *   - Table/other opaque string -> plain string (last-write-wins; v1 limitation,
 *     see the plan — table cells become their own CRDT map in a later phase)
 *   - answerSources / attachments / non-answer FormState fields -> plain JSON in `meta`
 *
 * Round-trip contract (proven by spike, see docs/spike-phase0-collab.md notes):
 *   - CANONICAL Tiptap HTML (what editor.getHTML() emits) round-trips byte-equal.
 *     Non-canonical input is normalized by Tiptap's own schema on parse — the
 *     same normalization the editor applies when it loads legacy content.
 *   - An empty rich-text answer serializes to '' (never '<p></p>'), matching the
 *     Answer-HTML contract enforced in TiptapEditor.vue.
 */
import * as Y from 'yjs'
import { getSchema } from '@tiptap/core'
import { generateHTML } from '@tiptap/html'
import StarterKit from '@tiptap/starter-kit'
import {
  prosemirrorJSONToYXmlFragment,
  yXmlFragmentToProseMirrorRootNode,
} from 'y-prosemirror'
import { generateJSON } from '@tiptap/html'
import type { FormState } from '../stores/assessmentStore'
import type { Answers, AnswerRevision } from '../models/Assessment'

// Must mirror the extensions TiptapEditor.vue uses so parse/serialize match the
// editor exactly. Placeholder is a decoration only (no schema nodes/marks) and
// is intentionally omitted.
const EXTENSIONS = [StarterKit]
const schema = getSchema(EXTENSIONS)

// Structural keys of the Y.Doc — shared with dossierDoc.ts so the shape is
// defined in exactly one place.
export const DOSSIER_KEY = 'dossier'
export const FORMS_KEY = 'forms'
// Explicit "this doc has been seeded from JSON" flag. Decoupled from whether the
// forms map exists, because an editor can create structure (a text fragment /
// its form) before the seed runs (the seed is deferred to first sync). Only the
// seed sets this, so early structure creation doesn't block seeding.
const SEEDED_FLAG = '_seeded'
export const FORM_TEXT = 'text' // questionId -> 1 (index; content is a top-level fragment)
export const FORM_LIST = 'list' // questionId -> Y.Array<string> (checkbox)
export const FORM_RAW = 'raw' //  questionId -> string (table/opaque)
export const FORM_META = 'meta' // answerSources/attachments/non-answer fields
// Answer history lives in `meta` under one key per question, so two people
// editing different answers at once don't overwrite each other's revisions.
export const HISTORY_PREFIX = 'history:'

// Rich-text answers live as TOP-LEVEL Y.XmlFragments, not nested in the form
// map. Top-level types are keyed by name and shared across peers by that name,
// so `doc.get(key, Y.XmlFragment)` is idempotent — every client (and every
// bound editor) resolves the *same* fragment, with no create-race that a nested
// `map.set(qid, new fragment)` would lose to last-write-wins. The per-form
// FORM_TEXT map is just an index of which questionIds are rich text.
const TEXT_PREFIX = 'answer:'

function textFragmentKey(formId: string, questionId: string): string {
  return `${TEXT_PREFIX}${formId}\u0000${questionId}`
}

/** The shared top-level rich-text fragment for one answer. Idempotent: same key
 *  → same fragment on every peer. Bind editors to this. */
export function getTextFragment(doc: Y.Doc, formId: string, questionId: string): Y.XmlFragment {
  return doc.get(textFragmentKey(formId, questionId), Y.XmlFragment)
}

/** An empty form's Y.Map (the four buckets + default meta), matching
 *  assessmentStore.initialFormState(). Used when a form is opened after its
 *  dossier's live doc already exists. */
export function newFormMap(): Y.Map<unknown> {
  const f = new Y.Map<unknown>()
  f.set(FORM_TEXT, new Y.Map<number>())
  f.set(FORM_LIST, new Y.Map<Y.Array<string>>())
  f.set(FORM_RAW, new Y.Map<string>())
  // Empty meta: fields are filled by the seed (set-if-absent) or by mutators,
  // and read back with defaults. Leaving them unset lets a form auto-created by
  // an editor (pre-seed) still receive the server's meta when the seed runs.
  f.set(FORM_META, new Y.Map<unknown>())
  return f
}

/** Read a rich-text fragment back to canonical Tiptap HTML. Empty collapses to
 *  '' (never '<p></p>'), matching the editor and the Answer-HTML contract. */
function readTextFragment(frag: Y.XmlFragment): string {
  const node = yXmlFragmentToProseMirrorRootNode(frag, schema)
  return node.textContent.trim() ? generateHTML(node.toJSON(), EXTENSIONS) : ''
}

/** Write HTML into an *already-attached* fragment, diffing against its current
 *  content so a bound editor sees a minimal delta (and its identity survives).
 *  The fragment must already be integrated into a doc. */
export function writeTextFragment(frag: Y.XmlFragment, html: string): void {
  prosemirrorJSONToYXmlFragment(schema, generateJSON(html, EXTENSIONS), frag)
}

/** The collab-synced dossier envelope — exactly what saveDossier() PUTs today
 *  (documents/grants/myRole are server-owned and NOT part of the CRDT doc). */
export interface DossierPayload {
  id: string
  name: string
  createdAt: number
  updatedAt?: number
  sessionId: string
  activeFormId: string | null
  forms: Record<string, FormState>
}

/** Table answers are stored as JSON — either a bare array of rows (legacy) or a
 *  `{ rows, notes }` object (current, since the Toelichting field was added).
 *  Rich text is HTML and never parses as JSON, so this routes table/opaque
 *  strings around the text path without needing the form schema here. Missing
 *  the object shape would (wrongly) send table answers through the rich-text
 *  path, which HTML-wraps them and corrupts the round-trip. */
function isOpaqueString(v: string): boolean {
  if (!v) return false
  try {
    const parsed = JSON.parse(v)
    if (Array.isArray(parsed)) return true
    return parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
  } catch {
    return false
  }
}

/** Separator in a radio answer that carries a follow-up: "Ja\n---\n<p>…</p>".
 *  A private encoding, never part of an answer's own content. */
const FOLLOWUP_SEP = '\n---\n'

/** Strings that must survive byte-equal and so never go through the rich-text
 *  path, which would parse them as prose. Table JSON is one; so is a radio
 *  answer with a follow-up, whose separator the HTML round-trip would flatten
 *  to " --- " — silently swallowing the toelichting. A bare radio answer ("Ja")
 *  is indistinguishable from prose here; the question type tells DossierDoc
 *  (see its `opaque` argument), and readers strip tags off legacy values. */
export function isVerbatimString(v: string): boolean {
  return isOpaqueString(v) || v.includes(FOLLOWUP_SEP)
}

/** A top-level rich-text fragment to fill after its form map is attached. */
type PendingText = [formId: string, questionId: string, html: string]

function decodeForm(doc: Y.Doc, formId: string, f: Y.Map<unknown>): FormState {
  const text = f.get(FORM_TEXT) as Y.Map<number>
  const list = f.get(FORM_LIST) as Y.Map<Y.Array<string>>
  const raw = f.get(FORM_RAW) as Y.Map<string>
  const meta = f.get(FORM_META) as Y.Map<unknown>

  const answers: Answers = {}
  text.forEach((_marker, qid) => {
    answers[qid] = readTextFragment(getTextFragment(doc, formId, qid))
  })
  list.forEach((arr, qid) => {
    answers[qid] = arr.toArray()
  })
  raw.forEach((s, qid) => {
    answers[qid] = s
  })
  let answerHistory: FormState['answerHistory']
  meta.forEach((value, key) => {
    if (!key.startsWith(HISTORY_PREFIX)) return
    answerHistory ??= {}
    answerHistory[key.slice(HISTORY_PREFIX.length)] = value as AnswerRevision[]
  })

  return {
    answers,
    answerSources: (meta.get('answerSources') as FormState['answerSources']) ?? {},
    attachments: (meta.get('attachments') as FormState['attachments']) ?? {},
    // Undefined (not {}) when empty, so the envelope of a dossier nobody has
    // edited since this field existed stays exactly what it was.
    answerHistory,
    currentView: (meta.get('currentView') as string) ?? 'home',
    completedSections: (meta.get('completedSections') as string[]) ?? [],
    riskLevel: (meta.get('riskLevel') as FormState['riskLevel']) ?? null,
    goDecision: (meta.get('goDecision') as FormState['goDecision']) ?? null,
    // Optional: only the beslishulp host form ever carries one, and only after
    // the beslishulp has been run. Kept undefined (not null) elsewhere so the
    // JSON envelope stays identical to what pre-beslishulp dossiers stored.
    beslishulp: (meta.get('beslishulp') as FormState['beslishulp']) ?? undefined,
    // Same deal as beslishulp: only the scan's host form ever carries one.
    toepassingsscan: (meta.get('toepassingsscan') as FormState['toepassingsscan']) ?? undefined,
  }
}

/** Whether a doc has been seeded from JSON (explicit flag). Drives the seed-once
 *  collab pattern: only the first peer into an empty room seeds. */
export function isDocSeeded(doc: Y.Doc): boolean {
  return doc.getMap(DOSSIER_KEY).get(SEEDED_FLAG) === true
}

function setIfAbsent(map: Y.Map<unknown>, key: string, value: unknown): void {
  if (map.get(key) === undefined) map.set(key, value)
}

/** Populate a doc's `dossier` map from stored JSON, additively — values already
 *  present (e.g. an answer a bound editor created before the seed ran, or state
 *  merged from the room) are never clobbered. Sets SEEDED_FLAG at the end.
 *  No-op if already seeded. */
export function seedDoc(doc: Y.Doc, payload: DossierPayload, origin?: unknown): void {
  if (isDocSeeded(doc)) return
  doc.transact(() => {
    const root = doc.getMap(DOSSIER_KEY)
    setIfAbsent(root, 'id', payload.id)
    setIfAbsent(root, 'name', payload.name)
    setIfAbsent(root, 'createdAt', payload.createdAt)
    if (payload.updatedAt !== undefined) setIfAbsent(root, 'updatedAt', payload.updatedAt)
    setIfAbsent(root, 'sessionId', payload.sessionId)
    setIfAbsent(root, 'activeFormId', payload.activeFormId)

    let forms = root.get(FORMS_KEY) as Y.Map<Y.Map<unknown>> | undefined
    if (!forms) {
      forms = new Y.Map<Y.Map<unknown>>()
      root.set(FORMS_KEY, forms)
    }

    const pending: PendingText[] = []
    for (const [fid, form] of Object.entries(payload.forms)) {
      let f = forms.get(fid)
      if (!f) {
        f = newFormMap()
        forms.set(fid, f)
      }
      const text = f.get(FORM_TEXT) as Y.Map<number>
      const list = f.get(FORM_LIST) as Y.Map<Y.Array<string>>
      const raw = f.get(FORM_RAW) as Y.Map<string>
      const meta = f.get(FORM_META) as Y.Map<unknown>

      for (const [qid, value] of Object.entries(form.answers)) {
        // A real pre-seed edit in the list/raw bucket wins — don't overwrite it.
        if (list.get(qid) !== undefined || raw.get(qid) !== undefined) continue
        if (Array.isArray(value)) {
          const arr = new Y.Array<string>()
          arr.push([...value])
          list.set(qid, arr)
        } else if (isVerbatimString(value)) {
          raw.set(qid, value)
        } else {
          // A bound editor index-marks an EMPTY fragment on mount, before the
          // seed. So a present FORM_TEXT index is NOT proof of content — only
          // skip if the fragment actually has text (a genuine pre-seed edit).
          if (readTextFragment(getTextFragment(doc, fid, qid)) !== '') continue
          text.set(qid, 1)
          pending.push([fid, qid, value])
        }
      }

      setIfAbsent(meta, 'answerSources', form.answerSources ?? {})
      setIfAbsent(meta, 'attachments', form.attachments ?? {})
      for (const [qid, revisions] of Object.entries(form.answerHistory ?? {})) {
        setIfAbsent(meta, HISTORY_PREFIX + qid, revisions)
      }
      setIfAbsent(meta, 'currentView', form.currentView)
      setIfAbsent(meta, 'completedSections', [...form.completedSections])
      setIfAbsent(meta, 'riskLevel', form.riskLevel)
      setIfAbsent(meta, 'goDecision', form.goDecision)
      if (form.beslishulp !== undefined) setIfAbsent(meta, 'beslishulp', form.beslishulp)
      if (form.toepassingsscan !== undefined) setIfAbsent(meta, 'toepassingsscan', form.toepassingsscan)
    }
    // Top-level fragments are integrated the moment doc.get() names them.
    for (const [fid, qid, html] of pending) {
      writeTextFragment(getTextFragment(doc, fid, qid), html)
    }
    root.set(SEEDED_FLAG, true)
  }, origin)
}

/** Seed a fresh Y.Doc from a stored dossier (local, no-transport path). */
export function dossierToYDoc(payload: DossierPayload): Y.Doc {
  const doc = new Y.Doc()
  seedDoc(doc, payload)
  return doc
}

/** Snapshot the live Y.Doc back to the JSON envelope (persist / export). */
export function yDocToDossier(doc: Y.Doc): DossierPayload {
  const root = doc.getMap(DOSSIER_KEY)
  const formsMap = root.get(FORMS_KEY) as Y.Map<Y.Map<unknown>>

  const forms: Record<string, FormState> = {}
  formsMap.forEach((f, fid) => {
    forms[fid] = decodeForm(doc, fid, f)
  })

  const payload: DossierPayload = {
    id: root.get('id') as string,
    name: root.get('name') as string,
    createdAt: root.get('createdAt') as number,
    sessionId: root.get('sessionId') as string,
    activeFormId: root.get('activeFormId') as string | null,
    forms,
  }
  const updatedAt = root.get('updatedAt')
  if (updatedAt !== undefined) payload.updatedAt = updatedAt as number
  return payload
}
