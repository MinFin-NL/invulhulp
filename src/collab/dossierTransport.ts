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

/** A stable, readable colour from a user id — same person, same colour. */
export function colorForUser(sub: string): string {
  let h = 0
  for (let i = 0; i < sub.length; i++) h = (h * 31 + sub.charCodeAt(i)) % 360
  return `hsl(${h}, 65%, 45%)`
}

/** Set the local user broadcast to collaborators. Call once after login. */
export function setLocalUser(user: { sub: string; name: string }): void {
  localUser = { ...user, color: colorForUser(user.sub) }
  for (const p of providers.values()) applyLocalUser(p)
}

function applyLocalUser(provider: Provider): void {
  if (localUser) provider.awareness.setLocalStateField('user', localUser)
}

function wireAwareness(dossierId: string, provider: Provider): void {
  let knownPeers = new Set<number>()
  const recompute = () => {
    const self = provider.awareness.clientID
    const users: PresentUser[] = []
    const peers = new Set<number>()
    for (const [clientId, state] of provider.awareness.getStates()) {
      const u = state.user as { sub?: string; name?: string; color?: string } | undefined
      if (u?.sub) {
        users.push({
          clientId,
          sub: u.sub,
          name: u.name ?? '',
          color: u.color ?? '#888',
          isSelf: clientId === self,
        })
      }
      if (clientId !== self) peers.add(clientId)
    }
    presenceRoster.set(dossierId, users)
    presenceCbs.get(dossierId)?.forEach((cb) => cb(users))

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

/** Tear down a dossier's live sync (revoked share, dossier closed). */
export function disconnectDossier(dossierId: string): void {
  const p = providers.get(dossierId)
  if (p) {
    p.destroy()
    providers.delete(dossierId)
  }
  const idb = idbPersistences.get(dossierId)
  if (idb) {
    // destroy() detaches but keeps the IndexedDB data for the next open.
    void idb.destroy()
    idbPersistences.delete(dossierId)
  }
  connecting.delete(dossierId)
  presenceRoster.set(dossierId, [])
  presenceCbs.get(dossierId)?.forEach((cb) => cb([]))
}

/** Drop all live connections (e.g. before a full server reload). */
export function disconnectAll(): void {
  for (const id of [...providers.keys()]) disconnectDossier(id)
}
