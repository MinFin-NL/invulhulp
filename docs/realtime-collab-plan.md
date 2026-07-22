# Real-time collaborative editing — phased plan

Status: **proposal**. Replaces today's last-write-wins whole-dossier sync
(`dossiers.put_dossier`, `assessmentStore.schedulePush`) with CRDT-based
concurrent editing.

## Goal & non-goals

**Goal:** two or more editors work the same dossier simultaneously without
silent data loss; each sees the other's changes live; offline edits merge
cleanly on reconnect.

**Non-goals (v1):** comment threads, per-answer edit history/blame, granular
field-level permissions (grant stays dossier-level: viewer/editor/owner).

## The hard constraint driving the design

A dossier is `forms[formId].answers[questionId]`, and answer values are a
**mix of types**, not just rich text:

| Answer kind | Storage today | CRDT treatment |
|---|---|---|
| Rich text | Tiptap HTML string | `Y.XmlFragment` (native Tiptap collab) |
| Checkbox | `string[]` | `Y.Array` / `Y.Map` |
| Table | JSON string (per table-questions contract) | `Y.Map` of cells |
| Attachments | metadata + bytes in imagestore | `Y.Array` of refs (bytes stay in imagestore) |
| answerSources / AI metadata | per-question objects | `Y.Map` values |

So we cannot CRDT the text fields and leave the rest on last-write-wins —
that splits the brain. **The whole dossier becomes one Yjs document.** Yjs
becomes the source of truth for a loaded dossier; Pinia (`assessmentStore`)
mirrors it for the UI; the JSON file shape is *derived* on snapshot so exports,
RAG, and the LLM pipeline keep reading the contract they read today.

---

## Phase 0 — Spike (throwaway, ~2–3 days)

Prove the transport + auth + persistence loop end to end on the simplest field.

- Branch, no production wiring. One form, one rich-text answer.
- Stand up the sync server (see Phase 2 decision) and connect two browser tabs.
- Validate: concurrent typing in the same answer merges; Keycloak cookie
  authenticates the socket; a Yjs update round-trips to disk and back.
- **Exit criteria:** two tabs, same answer, no lost keystrokes, reload survives.
- Throw the spike away. Its only output is the answer to "sidecar or Python?"

---

## Phase 1 — Yjs document model (foundation)

Define the shared shape independent of transport.

- Add `yjs`. Design the doc: `Y.Doc` → `forms: Y.Map` → each form a `Y.Map`
  → `answers: Y.Map`, values typed per the table above.
- Write **bidirectional binding**: Yjs doc ⇄ `assessmentStore` state. Every
  mutator that calls `touch()` today (`setAnswer`, `setAnswerForForm`,
  checkbox toggles, table edits, attachment add/remove, `activeFormId`) writes
  *through* the Yjs doc; a Yjs observer patches Pinia back.
- Write the **snapshot codec**: `Y.Doc → DossierPayload JSON` (the shape
  `put_dossier` and exports expect) and `JSON → Y.Doc` (seed from existing
  stored dossiers). This is the compatibility guarantee for the rest of the app.
- Retire `schedulePush`/`touch`'s debounced whole-blob PUT for loaded dossiers.
- **Exit criteria:** local-only Yjs doc drives the entire dossier UI; snapshot
  round-trips a real dossier with tables, checkboxes, and attachments byte-equal.

### Progress

- **DONE — snapshot codec + round-trip test.** `src/collab/ydocCodec.ts`
  (`dossierToYDoc` / `yDocToDossier`) with `ydocCodec.test.ts` (9 tests, green).
  Rich text → `Y.XmlFragment` via `y-prosemirror` (character-level collab);
  checkbox → `Y.Array`; table/opaque string → plain string (v1 last-write-wins);
  answerSources/attachments/non-answer fields → plain JSON in a `meta` map.
  Deps added: `yjs`, `y-prosemirror`, `@tiptap/html`, `vitest` (first test in repo).
- **Spike finding that shaped the codec** (retires the "y-protocol drift" risk
  from Phase 2's table): the HTML↔`Y.XmlFragment` round-trip via `y-prosemirror`
  + the Tiptap schema is faithful. Byte-equality holds for **canonical** Tiptap
  HTML (what `editor.getHTML()` emits); non-canonical input is normalized by
  Tiptap's own schema on parse (e.g. `<li>x</li>` → `<li><p>x</p></li>`), the
  same normalization the editor does on load. Empty rich text must be
  special-cased to `''` (an empty doc serializes to `<p></p>`), matching the
  Answer-HTML contract. The codec runs in the default node vitest env — no jsdom
  needed (`@tiptap/html` ships its own lightweight DOM).
- **DONE — collaborative binding layer.** `src/collab/dossierDoc.ts`
  (`DossierDoc`) wraps one dossier's Y.Doc: through-the-doc mutators
  (`setAnswer` dispatches text/checkbox/table like `setAnswerForForm`;
  `setRiskLevel`/`setGoDecision`/`setCurrentView`/`markSectionCompleted`/
  `setActiveFormId`), an `onChange` observer that reports local-vs-remote origin
  with a fresh snapshot, and `encodeState`/`applyUpdate` for sync.
  `dossierDoc.test.ts` (9 tests) proves the headline guarantee: **concurrent
  edits to different answers both survive** — the exact clobber that
  `dossiers.put_dossier` has today — plus same-answer char-level merge and
  two-peer convergence. Rich-text keystrokes are deliberately NOT funneled
  through `setAnswer` (that path is for programmatic whole-answer writes: AI
  Modus, cross-form, import); the editor binds to the fragment directly in Phase 3.
- **DONE — assessmentStore wired to DossierDoc.** One live doc per dossier
  (`dossierDocs` map, module scope); `_docFor(id)` lazily seeds it from Pinia and
  subscribes an `onChange` mirror. All content mutators (`setAnswer`/
  `setAnswerForForm`, `setRiskLevel`, `setGoDecision`, `markSectionCompleted`,
  `setAnswerSources`, `dismissSourceWarning`, `add/remove/updateAttachment`,
  `reset`/`resetActive`) now write *through* the doc. The mirror merges only
  shared **content** back into Pinia and preserves per-user nav (`currentView`,
  `activeFormId`) and server-owned fields (`documents`, sharing) — the key design
  call, since `DossierPayload` conflates content and navigation.
  `assessmentStore.integration.test.ts` (9 tests) proves the wiring headlessly:
  routing, dispatch, no-clobber, currentView/documents preserved, AI-Modus
  targeted writes, updatedAt bump. `loadFromServer` clears live docs so they
  re-seed from the merged result.
- **Dependency note:** adding `@tiptap/html` dragged `@tiptap/core` to 3.28,
  which broke the build (`@tiptap/vue-3@3.22` uses a core API 3.28 removed). All
  `@tiptap/*` are now pinned `~3.22.3` with an `overrides` block forcing
  transitive `@tiptap/core`/`@tiptap/extensions` to 3.22.x. `npm run build` green.
- **DONE — real-app smoke test (Playwright/headless Chromium).** Typed into a
  rich-text answer in the running app: renders correctly, canonical HTML in the
  editor, no console errors, and the edit **persisted to the server** in correct
  codec shape (`intake.answers` + full FormState) and to localStorage.
  `loadFromServer` reloads it into Pinia with forms intact. The edit→doc→mirror→
  persist→server chain works end to end.
- **Pre-existing bug found (NOT this change), flagged for follow-up:**
  `DossierList.vue:88` / `DossierDetail.vue:332` call `ensureDossier()` on mount;
  App.vue does `await fetchMe()` *then* `loadFromServer()`, so during the fetchMe
  await the list mounts and `ensureDossier()` (serverLoadPending still false,
  dossiers empty) creates a **spurious empty "Dossier 1"**, and the real server
  dossier loads as a second one. Repro: empty localStorage + a dossier already on
  the server (opening a shared dossier on a second device). Fix candidates: set
  `serverLoadPending` before `fetchMe`, or gate the component-level
  `ensureDossier()` calls, or dedupe in `loadFromServer`. Untouched by this branch.
- **Not yet done / watch during interactive testing:** (1) rich-text *keystrokes*
  still route through `setAnswer` (whole-fragment diff + full-dossier decode per
  keystroke) — correct but potentially heavy on large dossiers; Phase 3's direct
  editor↔fragment binding removes this hot path. (2) Persistence still reads Pinia
  in `schedulePush` (Pinia is now mirror-accurate for content), so the whole-blob
  PUT is retained deliberately — server contract unchanged. (3) ~~AI Modus
  transaction batching (Risk 1)~~ **DONE** — see below. (4) Real-app smoke test
  done in Phase 1/2/3 progress notes.

### Risk 1 — AI Modus transaction batching (DONE)

Original concern: a bulk-fill writing many answers must be atomic against a
co-editor. Resolution:
- **Streamed fills** (`bulkExtractFromDocument`'s `onAnswer`, `smoothFormAnswers`'s
  `onRewrite`) arrive one answer at a time as the LLM streams — each is naturally
  its own transaction, and incremental visibility is the *right* collab UX (peers
  watch answers appear). With top-level per-answer fragments, filling answer Y
  never clobbers a co-editor in answer X. Left as-is by design.
- **Synchronous bursts** — the real batching case — is `undoSmoothing`, which
  restores *all* pre-smoothing originals in one loop. Now wrapped in
  `store.batchAnswers(dossierId, fn)` → `DossierDoc.transact` (a single
  `LOCAL_ORIGIN` doc transaction; nested `setAnswer` calls coalesce). Peers see
  the undo as one coherent change, it's one undo step, and the mirror + server
  push fire once. Proven: `transact()` coalesces N `setAnswer`s into one
  `onChange` (dossierDoc.test.ts), and `batchAnswers` applies atomically
  (store integration test).

---

## Phase 2 — Sync transport + persistence bridge

**Decision (from Phase 0): Hocuspocus Node sidecar vs. pycrdt in FastAPI.**

- *Sidecar:* `@hocuspocus/server` (+ `@hocuspocus/provider` client). Best
  support, batteries included; costs a second service in `docker-compose.yml`,
  a container in `Dockerfile`, a stage in `azure-pipelines.yml`, and a second
  auth integration point.
- *Python-native:* `pycrdt` + `pycrdt-websocket` on FastAPI (uvicorn[standard]
  already carries WebSocket support). One backend, one auth story; less-travelled.

Then:

- **Persistence bridge:** the sync server's `onStoreDocument`/equivalent
  writes via `dossierstore.save_dossier` using the Phase 1 snapshot codec (or
  persists the Yjs binary and derives JSON on read — decide based on export
  latency needs). `onLoadDocument` seeds from the stored dossier.
- **Auth on the handshake:** validate the same signed Keycloak session cookie
  as `require_user`, then re-run `resolve_session_access(min_role="editor")` to
  gate write access at the socket. Viewers connect read-only.
- **Exit criteria:** two *different accounts* edit one shared dossier live;
  server restart preserves state; a viewer cannot mutate.

### Progress — DECISION: Python-native (pycrdt-websocket in FastAPI)

The Phase 0 spike settled it: `SessionMiddleware` processes the WebSocket scope,
so `websocket.session` carries the same Keycloak identity — one backend, one auth
story, no sidecar. Chosen.

- **DONE — transport (first increment), verified live in the real app.**
  - Backend `collab.py`: `WebsocketServer` (pycrdt) at `/api/collab/{dossier_id}`,
    one room per dossier. Auth via `websocket.session` (dev-bypass aware); access
    gated to editor/owner via `dossierstore.role_of` + `ROLE_ORDER`. Started in the
    FastAPI lifespan; router registered in `main.py`.
  - `auth.require_user` retyped `Request` → `HTTPConnection` (shared base) so the
    app-level gate resolves for WebSocket routes and lets them self-authenticate
    (the exact Phase 2 task the spike predicted).
  - Frontend `dossierTransport.ts`: `y-websocket` `WebsocketProvider`, dynamically
    imported, no-op without `WebSocket` (headless tests). `vite.config.ts` proxy
    gets `ws: true`.
  - **Seed-once pattern** (the crux of multi-client correctness): clients connect
    with an *empty* doc and seed from JSON only if the room is still empty after
    sync (`seedDoc`/`isDocSeeded`/`DossierDoc.seedFrom`, `SEED_ORIGIN`). Avoids two
    peers independently building — and duplicating — the nested CRDT tree.
    `_docFor` connects on open (`setActiveForm`) so readers receive edits too.
  - **Verified:** headless two-client sync (bidirectional + late-joiner state) AND
    two-browser-tab live sync in the running app — one tab's keystrokes appear in
    the other's editor with no reload, no console errors, no backend tracebacks.
- **Two concurrency bugs fixed (surfaced by collaboration):**
  - `dossierstore.save_dossier` used a single `.json.tmp` path → two clients
    PUTting the same shared dossier at once raced (`FileNotFoundError` on the
    vanished temp, HTTP 500). Now a per-write unique temp name (`pid.uuid.tmp`)
    with cleanup on failure.
  - The mirror now persists only **local** edits; a peer's received edit updates
    Pinia/localStorage but isn't re-PUT (the originator persists it) — removes the
    redundant double-write.
- **Bonus — pre-existing dossier-dup race fixed.** `App.vue` now calls
  `store.beginServerLoad()` synchronously in setup, blocking `ensureDossier`'s
  auto-create (called from `DossierList`/`DossierDetail` child `onMounted`, which
  runs before the parent's `loadFromServer`) until the server load completes.
- **Not yet done in Phase 2:** (1) **durable Y persistence** — the room is
  in-memory; JSON via `schedulePush` is the durable layer, so a server restart with
  all clients disconnected drops unsynced-to-JSON state (rare given the 1.5 s
  debounce). A `YStore` (or the Python-side codec bridge) is the follow-up for the
  "server restart preserves state" exit criterion. (2) **Real-account auth gate**
  verified only under `--dev`; needs a full-stack Keycloak check. (3) **Multi-replica**
  backchannel (Redis) — single-replica assumption holds for now. (4) **Simultaneous
  first-open** race (two peers seeding a truly-empty room at the same instant) and
  **edit-before-sync** remain edge cases.

---

## Phase 3 — Presence & awareness

- `@tiptap/extension-collaboration-cursor` + Yjs awareness. Feed user
  name/color from the Keycloak session.
- "Who's here" indicator in `DossierDetail`; live cursors/selection in
  `TiptapEditor.vue`.
- **Exit criteria:** each editor sees the others' presence and text cursors.

### Progress

- **DONE — "who's here" presence, verified live.** Yjs awareness over the
  existing provider: `dossierTransport.setLocalUser` (identity from the auth
  store, stable per-user colour via `colorForUser`) + `onPresence`/`usePresence`
  reactive roster; `PresenceBar.vue` shows other collaborators' avatars in the
  header breadcrumb. Set in `App.vue` after login.
  - **Interop fix:** pycrdt's `YRoom.serve` sends a newcomer the doc state but
    *not* the existing awareness, so presence was asymmetric (incumbent saw the
    newcomer, not vice-versa). Fixed client-side: on detecting a new peer a
    client re-announces itself (guarded against looping), so the newcomer
    receives it. Verified symmetric in two tabs.
- **DONE — editor↔fragment binding + in-text live cursors, verified live.**
  The Tiptap editor now binds directly to an answer's `Y.XmlFragment`
  (`@tiptap/extension-collaboration`) with remote cursors
  (`@tiptap/extension-collaboration-caret`), giving true character-level merge and
  live carets. Verified in two tabs: A types "AAA", B types "BBB" into the *same*
  answer and **both survive in both** (the old whole-fragment path clobbered one),
  remote caret widgets render, edits persist to the server, no console errors.
  - **Storage restructure (required for a correct binding):** rich-text answers
    moved from nested `Y.Map` fragments to **top-level fragments keyed by name**
    (`getTextFragment`) — top-level types are idempotent/shared across peers, so
    every client's bound editor resolves the *same* fragment with no
    create-race that a nested `map.set(new fragment)` loses to LWW. `FORM_TEXT`
    is now just an index of which questionIds are text.
  - **Seed made robust to pre-seed use:** an explicit `_seeded` flag (not "forms
    map exists"), an `ensureForm` that creates the forms map on demand, and an
    **additive** `seedDoc` (set-if-absent) — because a bound editor needs a text
    fragment's form before the deferred (on-sync) seed runs, and its pre-seed
    edits must not be clobbered.
  - **Wiring:** `DossierDoc.textFragment` + store `textFragmentFor`, transport
    `getProvider`/`onProviderReady`/`getLocalUser`, a `useCollab` composable, and
    `TiptapEditor` props (`fragment`/`provider`/`user`) that switch it from
    `v-model` to collaborative binding (StarterKit history off; Collaboration
    supplies undo). `QuestionItem` binds text questions and keys the editor on
    provider-readiness so the caret attaches once connected.
  - **Mirror-persist fix:** local editor typing carries y-prosemirror's origin
    (not `LOCAL_ORIGIN`), so the mirror now persists everything except the remote
    *provider*'s edits — otherwise a user's own typing wouldn't reach the server.
  - The follow-up (radio) editor stays on the classic `v-model` path (composite
    `option\n---\nfollowup` value, low collab value).

---

## Phase 4 — Offline & reconciliation

- `y-indexeddb` for offline persistence, replacing today's localStorage
  timestamp reconciliation in `loadFromServer`.
- Verify: edit offline in two clients, reconnect, both sets of edits survive
  and merge (no timestamp clobber).
- **Exit criteria:** the current localStorage reconciliation branch is gone and
  offline-edit merge is demonstrably lossless.

### Progress — DONE, verified live

- **`y-indexeddb` attached per dossier** in `connectDossier`: each doc hydrates
  from IndexedDB and persists edits there as CRDT ops. **Seed ordering is the
  correctness crux** — `onReady` (which triggers seed-if-empty) now waits for
  *both* `idb.whenSynced` and the WS `sync` (4 s fallback), so we never seed a
  duplicate of what IndexedDB is about to hydrate.
- **Why it matters over the old path:** the Pinia-snapshot + seed-once path
  *loses* an offline edit when the room already has state (seed-once skips, and
  the snapshot doesn't merge). IndexedDB keeps the offline edit as CRDT ops that
  merge losslessly on reconnect.
- **Verified (Playwright, real app):** typed M1 online → server; went offline
  (WS + dossiers PUT both blocked), typed M2, reloaded (in-memory doc gone, only
  IndexedDB has M2); back online → **server ends with M1 AND M2** — the offline
  edit survived and merged. Without IndexedDB, M2 would be lost.
- **Reconciliation:** `loadFromServer`'s timestamp merge is kept as a *display
  cache* for the dossier list (unopened dossiers); for any opened dossier the
  CRDT doc + IndexedDB are authoritative and reconcile losslessly on the doc.
  `push-after-seed` ensures fast typing on open (pre-seed edits captured under
  `SEED_ORIGIN`) still reaches the server.
- **Bug fixed along the way:** `seedDoc` skipped a text answer if its `FORM_TEXT`
  index existed — but a bound editor index-marks an *empty* fragment on mount,
  before the seed. Now it skips only if the fragment has actual content, so a
  content-bearing dossier opened fresh seeds correctly.
- **Deterministic editor-binding test added** (`editorBinding.test.ts`, jsdom):
  an editor bound to a pre-populated fragment renders it on creation and reflects
  later updates. (A long detour chasing a "fresh open shows empty" symptom turned
  out to be a flaky test navigation opening *different forms* for the two
  clients, not an app bug — this unit test pins the real behavior deterministically.)

---

## Cross-cutting risks

- **AI Modus bulk-fill** writes many answers at once — must write through the
  Yjs doc, not around it, or it clobbers concurrent edits.
- **Exports/RAG/LLM** are downstream JSON readers; the snapshot codec is the
  single contract that keeps them working. Guard it with tests.
- **Grants remain dossier-level**; `ownerSub`/`grants` stay server-authoritative
  and never client-writable (unchanged from today).

## Rough effort

2–4 focused weeks. Phase 0–1 is the conceptual bulk; Phase 2 is the
integration risk; the non-text data model (Phase 1) is where unplanned time goes.
