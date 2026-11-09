/**
 * Frontend collab transport (Phase 2). Connects a dossier's Y.Doc to the
 * backend y-protocol WebSocket (/api/collab/:dossierId) so edits sync live
 * between clients. Kept separate from DossierDoc so the CRDT layer stays
 * transport-agnostic and unit-testable without a socket.
 *
 * No-op outside a browser (headless tests have no `WebSocket`), and y-websocket
 * is dynamically imported so it never loads in the node test path or the
 * initial bundle.
 */
import type * as Y from 'yjs'

/** A collaborator currently connected to a dossier (from Yjs awareness). */
export interface PresentUser {
  clientId: number
  sub: string
  name: string
  color: string
  isSelf: boolean
}

/** A client whose AI Modus run is working on one question right now. Broadcast
 *  over awareness so collaborators see the field is being written, not just the
 *  person who started the run. */
export interface AiBusyPeer {
  clientId: number
  name: string
  isSelf: boolean
  formId: string
  questionId: string
}

interface Awareness {
  clientID: number
  setLocalStateField(field: string, value: unknown): void
  getStates(): Map<number, Record<string, unknown>>
  on(event: 'change', cb: () => void): void
}
type Provider = { destroy(): void; awareness: Awareness }
type IdbPersistence = { destroy(): Promise<void>; whenSynced: Promise<unknown> }

const providers = new Map<string, Provider>()
// IndexedDB persistence per dossier — offline durability. destroy() detaches but
// keeps the stored data, so it re-hydrates on the next open.
const idbPersistences = new Map<string, IdbPersistence>()
const connecting = new Set<string>()
// Fired when a dossier's provider first exists, so a bound editor can add its
// collaboration caret once the awareness channel is live.
const providerReadyCbs = new Map<string, Set<() => void>>()

/** The live provider for a dossier, or null if not connected yet. */
export function getProvider(dossierId: string): Provider | null {
  return providers.get(dossierId) ?? null
}

/** Whether a transaction came from the dossier's IndexedDB copy: stored state
 *  restored on open, not an edit. */
export function isStoredStateOrigin(dossierId: string, origin: unknown): boolean {
  return origin != null && idbPersistences.get(dossierId) === origin
}

/** Run `cb` when the dossier's provider exists (immediately if already). */
export function onProviderReady(dossierId: string, cb: () => void): () => void {
  if (providers.has(dossierId)) cb()
  let set = providerReadyCbs.get(dossierId)
  if (!set) providerReadyCbs.set(dossierId, (set = new Set()))
  set.add(cb)
  return () => {
    providerReadyCbs.get(dossierId)?.delete(cb)
  }
}

/** The local user identity (for a caret label), or null before login. */
export function getLocalUser(): { sub: string; name: string; color: string } | null {
  return localUser
}

// The local user's identity, broadcast via awareness. Set once at app start.
let localUser: { sub: string; name: string; color: string } | null = null
// Presence subscribers per dossier, and the last computed roster (so a late
// subscriber gets the current state immediately).
const presenceCbs = new Map<string, Set<(users: PresentUser[]) => void>>()
const presenceRoster = new Map<string, PresentUser[]>()
// Same shape for the AI-busy channel. `localAiBusy` is kept separately because a
// run can start before the provider exists (or without one at all) — it is what
// gets (re)published on connect, and what drives the roster while offline.
const aiBusyCbs = new Map<string, Set<(peers: AiBusyPeer[]) => void>>()
const aiBusyRoster = new Map<string, AiBusyPeer[]>()
// A list, not one entry: AI Modus asks several questions at once, and a dossier
// run fills several forms side by side.
const localAiBusy = new Map<string, AiBusyEntry[]>()

interface AiBusyEntry {
  formId: string
  questionId: string
}

// Collaborator colours (presence bar, editor carets): Rijkshuisstijl colours,
// as NLDD category tokens. In light mode each `filled` background is the step
// of NLDD's scale closest to the official value (lintblauw #154273, donkerblauw
// #01689B, hemelblauw #007BC7, …), and each carries a name label in white at
// ≥ 4.5:1. The light Rijkshuisstijl colours (mintgroen, geel, donkergeel,
// oranje, roze, lichtblauw) are left out on purpose: white text on them fails
// that contrast. Source: rijkshuisstijl.nl, Digitale stijlgids, kleuren.
const USER_CATEGORIES = [
  'lintblauw', 'paars', 'donkergroen', 'robijnrood', 'hemelblauw', 'bruin',
  'violet', 'mosgroen', 'donkerblauw', 'groen', 'donkerbruin', 'rood',
]

const categoryColor = (i: number) => `var(--semantics-categories-${USER_CATEGORIES[i]}-filled-background-color)`

function hashIndex(sub: string): number {
  let h = 0
  for (let i = 0; i < sub.length; i++) h = (h * 31 + sub.charCodeAt(i)) % USER_CATEGORIES.length
  return h
}

/** A user's own colour, from their id alone — what they get when nobody else
 *  holds it. It is a CSS custom-property reference, so it follows the colour
 *  scheme; consumers must use it as a whole value (no hex-alpha suffixes — use
 *  color-mix). With others present, use the roster's colour (colorForPeer). */
export function colorForUser(sub: string): string {
  return categoryColor(hashIndex(sub))
}

/** Colours for everyone present at once: each their own colour, unless someone
 *  earlier in id order holds it, then the next free one. Every client sorts the
 *  same roster, so all of them show the same person in the same colour; colours
 *  repeat only beyond USER_CATEGORIES.length people. */
export function assignUserColors(subs: Iterable<string>): Map<string, string> {
  const taken = new Set<number>()
  const out = new Map<string, string>()
  for (const sub of [...new Set(subs)].sort()) {
    let i = hashIndex(sub)
    for (let n = 0; taken.has(i) && n < USER_CATEGORIES.length; n++) i = (i + 1) % USER_CATEGORIES.length
    if (taken.size >= USER_CATEGORIES.length) i = hashIndex(sub)
    taken.add(i)
    out.set(sub, categoryColor(i))
  }
  return out
}

// Per dossier: the colour each present collaborator has right now.
const rosterColors = new Map<string, Map<string, string>>()

/** A collaborator's colour in this dossier — the same one the presence bar
 *  shows. Falls back to their own colour before the roster knows them. */
export function colorForPeer(dossierId: string | null, sub: string): string {
  return (dossierId && rosterColors.get(dossierId)?.get(sub)) || colorForUser(sub)
}

/** The text colour that goes on a colorForUser / NEUTRAL_USER_COLOR fill: the
 *  same category's filled content token, so it flips with the fill in dark mode. */
export function contentColorOn(fill: string): string {
  return fill.replace('-filled-background-color)', '-filled-content-color)')
}

/** Fallback for a peer that broadcast no colour. */
export const NEUTRAL_USER_COLOR = 'var(--semantics-categories-neutral-filled-background-color)'

/** Set the local user broadcast to collaborators. Call once after login. */
export function setLocalUser(user: { sub: string; name: string }): void {
  localUser = { ...user, color: colorForUser(user.sub) }
  for (const p of providers.values()) applyLocalUser(p)
}

function applyLocalUser(provider: Provider): void {
  if (localUser) provider.awareness.setLocalStateField('user', localUser)
}

function applyLocalAiBusy(dossierId: string, provider: Provider): void {
  const entries = localAiBusy.get(dossierId) ?? []
  provider.awareness.setLocalStateField('aiBusy', entries.length > 0 ? entries : null)
}

/** Announce that the local AI Modus run started (busy) or finished (not busy)
 *  one question. Safe to call before — or entirely without — a live connection. */
export function setLocalAiBusy(dossierId: string, entry: AiBusyEntry, busy: boolean): void {
  const others = (localAiBusy.get(dossierId) ?? []).filter(
    (e) => e.formId !== entry.formId || e.questionId !== entry.questionId,
  )
  publishLocalAiBusy(dossierId, busy ? [...others, entry] : others)
}

/** Drop every question the local run announced in this dossier (or in one form
 *  of it) — for a run that ends or is cancelled with calls still in flight. */
export function clearLocalAiBusy(dossierId: string, formId?: string): void {
  const entries = localAiBusy.get(dossierId) ?? []
  publishLocalAiBusy(dossierId, formId === undefined ? [] : entries.filter((e) => e.formId !== formId))
}

function publishLocalAiBusy(dossierId: string, entries: AiBusyEntry[]): void {
  localAiBusy.set(dossierId, entries)
  const provider = providers.get(dossierId)
  // With a provider the roster is rebuilt from awareness (which includes our own
  // state) via the 'change' handler; without one we are the only client there is.
  if (provider) applyLocalAiBusy(dossierId, provider)
  else recomputeAiBusy(dossierId)
}

/** A peer's broadcast `aiBusy`: a list, or — from a client on the previous
 *  version — a single entry. */
function busyEntries(raw: unknown): AiBusyEntry[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.filter(
    (e): e is AiBusyEntry => typeof e?.formId === 'string' && typeof e?.questionId === 'string',
  )
}

function recomputeAiBusy(dossierId: string): void {
  const provider = providers.get(dossierId)
  const peers: AiBusyPeer[] = []
  if (provider) {
    const self = provider.awareness.clientID
    for (const [clientId, state] of provider.awareness.getStates()) {
      const u = state.user as { name?: string } | undefined
      for (const busy of busyEntries(state.aiBusy)) {
        peers.push({ clientId, name: u?.name ?? '', isSelf: clientId === self, ...busy })
      }
    }
  } else {
    // Solo session, offline, or still connecting: only the local run can exist.
    for (const busy of localAiBusy.get(dossierId) ?? []) {
      peers.push({ clientId: -1, name: localUser?.name ?? '', isSelf: true, ...busy })
    }
  }
  aiBusyRoster.set(dossierId, peers)
  aiBusyCbs.get(dossierId)?.forEach((cb) => cb(peers))
}

/** Subscribe to the questions AI Modus is working on across all clients on this
 *  dossier. Fires immediately with the current roster. Returns an unsubscribe. */
export function onAiBusy(dossierId: string, cb: (peers: AiBusyPeer[]) => void): () => void {
  let set = aiBusyCbs.get(dossierId)
  if (!set) aiBusyCbs.set(dossierId, (set = new Set()))
  set.add(cb)
  cb(aiBusyRoster.get(dossierId) ?? [])
  return () => {
    aiBusyCbs.get(dossierId)?.delete(cb)
  }
}

function wireAwareness(dossierId: string, provider: Provider): void {
  let knownPeers = new Set<number>()
  const recompute = () => {
    const self = provider.awareness.clientID
    const users: PresentUser[] = []
    const peers = new Set<number>()
    for (const [clientId, state] of provider.awareness.getStates()) {
      const u = state.user as { sub?: string; name?: string } | undefined
      if (typeof u?.sub === 'string' && u.sub) {
        users.push({ clientId, sub: u.sub, name: u.name ?? '', color: '', isSelf: clientId === self })
      }
      if (clientId !== self) peers.add(clientId)
    }
    // Colours come from the roster, not from what each peer broadcasts, so two
    // people present at once never share one (see assignUserColors).
    const colors = assignUserColors(users.map((u) => u.sub))
    rosterColors.set(dossierId, colors)
    for (const u of users) u.color = colors.get(u.sub)!
    presenceRoster.set(dossierId, users)
    presenceCbs.get(dossierId)?.forEach((cb) => cb(users))
    recomputeAiBusy(dossierId)

    // The server relays awareness *changes* but doesn't replay existing state to
    // a client that just joined. So when we notice a new peer, re-announce
    // ourselves — that broadcast reaches the newcomer. (knownPeers guards the
    // re-announce from looping.)
    let newPeer = false
    for (const id of peers) if (!knownPeers.has(id)) newPeer = true
    knownPeers = peers
    if (newPeer) applyLocalUser(provider)
  }
  provider.awareness.on('change', recompute)
  recompute()
}

/** Subscribe to who's present on a dossier. Fires immediately with the current
 *  roster and on every change. Returns an unsubscribe. */
export function onPresence(dossierId: string, cb: (users: PresentUser[]) => void): () => void {
  let set = presenceCbs.get(dossierId)
  if (!set) presenceCbs.set(dossierId, (set = new Set()))
  set.add(cb)
  cb(presenceRoster.get(dossierId) ?? [])
  return () => {
    presenceCbs.get(dossierId)?.delete(cb)
  }
}

/**
 * Attach live sync to a dossier's doc. Idempotent per dossier id.
 *
 * `onReady` implements the seed-once pattern: it fires after the first sync with
 * the room (or a short fallback if no server), and the caller seeds the doc from
 * stored JSON *iff the room was empty* — so exactly one peer seeds and the rest
 * receive that state instead of independently constructing (and duplicating) it.
 */
export function connectDossier(doc: Y.Doc, dossierId: string, onReady: () => void): void {
  // node/jsdom — no transport. Node ≥21 has a global WebSocket, so also check
  // for IndexedDB (browser-only) or headless test runs crash in y-indexeddb.
  if (typeof WebSocket === 'undefined' || typeof indexedDB === 'undefined') { onReady(); return }
  if (providers.has(dossierId) || connecting.has(dossierId)) return
  connecting.add(dossierId)
  void Promise.all([import('y-websocket'), import('y-indexeddb')]).then(
    ([{ WebsocketProvider }, { IndexeddbPersistence }]) => {
      // disconnectDossier ran while the modules were loading (e.g. the store
      // dropped all docs to re-seed after a server load). Creating the provider
      // anyway would orphan it on a stale doc AND block the replacement doc
      // from ever connecting (the providers.has guard above).
      if (!connecting.has(dossierId)) return
      connecting.delete(dossierId)
      if (providers.has(dossierId)) return

      // Offline durability: hydrate this doc from IndexedDB and persist edits
      // there. Offline edits are stored as CRDT ops, so they merge losslessly
      // when the WebSocket reconnects — the whole point of Phase 4.
      // :g2 = collab state generation. Bumped 2026-07-23 to orphan doc lineages
      // seeded independently while the transport was broken (they merge into
      // duplicated/reverted content). Must match the backend's ybin generation.
      const idb = new IndexeddbPersistence(`dossier:${dossierId}:g2`, doc) as IdbPersistence
      idbPersistences.set(dossierId, idb)

      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${proto}://${location.host}/api/collab`
      // WebsocketProvider connects to `${url}/${dossierId}`.
      const provider = new WebsocketProvider(url, dossierId, doc, { connect: true })
      providers.set(dossierId, provider)
      applyLocalUser(provider)
      // A run that started before the socket came up is still going; publish it.
      applyLocalAiBusy(dossierId, provider)
      wireAwareness(dossierId, provider)
      providerReadyCbs.get(dossierId)?.forEach((cb) => cb())

      // Seed-if-empty only after BOTH the local (IndexedDB) and server (WS)
      // states are known. Seeding earlier would build a duplicate of what
      // IndexedDB is about to hydrate (or of the room). Offline (no WS) falls
      // back to a timeout so a first-ever open still seeds and works.
      let idbReady = false
      let wsReady = false
      let fired = false
      const maybeReady = () => {
        if (!fired && idbReady && wsReady) {
          fired = true
          onReady()
        }
      }
      idb.whenSynced.then(
        () => { idbReady = true; maybeReady() },
        () => { idbReady = true; maybeReady() },
      )
      // 'sync' also fires with false when the socket drops (y-websocket sets
      // synced = false on close) — that is not "server state received".
      // Treating it as ready would seed from local JSON while a peer's state
      // is still on its way: the independent-lineage duplication the
      // seed-once pattern exists to prevent.
      provider.on('sync', (isSynced: boolean) => {
        if (isSynced === false) return
        wsReady = true
        maybeReady()
      })
      // Offline fallback so a first-ever open still seeds and works. Guarded
      // by wsconnected: a live but slow handshake waits for the real sync
      // instead of racing it (that race is how the pre-g2 state got poisoned).
      setTimeout(() => {
        idbReady = true
        if (!provider.wsconnected) wsReady = true
        maybeReady()
      }, 4000)
      // Last resort — connected but never syncing (broken server): without
      // this, a first-ever open would never seed and the editor stays empty.
      setTimeout(() => { idbReady = true; wsReady = true; maybeReady() }, 15000)
    },
  )
}

/** Tear down a dossier's live sync (revoked share, dossier closed). Resolves
 *  once the IndexedDB connection is actually closed — callers that want to
 *  delete that database have to wait for it, or the delete blocks. */
function disconnectDossier(dossierId: string): Promise<void> {
  const p = providers.get(dossierId)
  if (p) {
    p.destroy()
    providers.delete(dossierId)
  }
  rosterColors.delete(dossierId)
  let closed = Promise.resolve()
  const idb = idbPersistences.get(dossierId)
  if (idb) {
    // destroy() detaches but keeps the IndexedDB data for the next open.
    closed = idb.destroy().catch(() => {})
    idbPersistences.delete(dossierId)
  }
  connecting.delete(dossierId)
  presenceRoster.set(dossierId, [])
  presenceCbs.get(dossierId)?.forEach((cb) => cb([]))
  // The local run (if any) is torn down with the dossier, so drop its state
  // rather than letting recomputeAiBusy resurrect it from the offline path.
  localAiBusy.delete(dossierId)
  aiBusyRoster.set(dossierId, [])
  aiBusyCbs.get(dossierId)?.forEach((cb) => cb([]))
  return closed
}

/** Erase a deleted dossier's local trace: disconnect, then drop its IndexedDB
 *  database. disconnectDossier alone keeps the stored doc for the next open —
 *  which for a deleted dossier means its answers stay on the machine. */
export function purgeDossierLocalState(dossierId: string): Promise<void> {
  return disconnectDossier(dossierId).then(
    () =>
      new Promise<void>((resolve) => {
        if (typeof indexedDB === 'undefined') return resolve()
        try {
          const req = indexedDB.deleteDatabase(`dossier:${dossierId}:g2`)
          // Resolve once the delete has run, so a caller about to leave the
          // page (logout) doesn't cut it off. `blocked` = another tab still
          // has it open; the delete stays queued, so don't wait on that tab.
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        } catch {
          // Private mode / storage disabled — nothing was persisted either.
          resolve()
        }
      }),
  )
}

/** Drop all live connections (e.g. before a full server reload). */
export function disconnectAll(): void {
  for (const id of [...providers.keys()]) disconnectDossier(id)
}
