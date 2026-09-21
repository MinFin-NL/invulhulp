# Architecture

This document describes how findocs is put together: the main parts, how data
moves between them, and which rules hold the system together. For what the app
does and how to run it, see [`README.md`](README.md). Design notes for single
features are in [`docs/`](docs/).

findocs (repo name `invulhulp`) is a proof of concept. Where this document
mentions a limitation, the limitation is deliberate for now.

## Bird's-eye view

```
                 Browser (Vue 3 SPA)
 ┌──────────────────────────────────────────────────────┐
 │ App.vue ─ AssessmentForm.vue (view switch, no router)│
 │   │                                                  │
 │   ├─ assessmentStore (Pinia) ◄─► DossierDoc (Y.Doc)  │
 │   │        │ debounced PUT          │ y-websocket    │
 │   ├─ llmService (fetch + SSE)       │                │
 │   └─ exports (docx / JSON)          │                │
 │                                                      │
 │ static: /forms/*.json, /beslishulp/ai-verordening.json│
 └────────┬─────────────────────────────┬───────────────┘
          │ /api/*  (session cookie)    │ /api/collab/:id (WebSocket)
 ┌────────▼─────────────────────────────▼───────────────┐
 │ nginx (prod) / vite proxy (dev)                      │
 └────────┬─────────────────────────────────────────────┘
 ┌────────▼─────────────────────────────────────────────┐
 │ FastAPI  backend/main.py   (global require_user gate)│
 │  auth · dossiers · users · admin_users · collab      │
 │  improve / extract / synthesize / smooth  (SSE)      │
 │  documents · images · RAG retrieval                  │
 └──┬──────────┬───────────────┬──────────────┬─────────┘
    │          │               │              │
 Keycloak   llm.py          rag.py        /data (files)
 (OIDC,     Azure OpenAI    LanceDB       docs/ images/
 Admin API) or Ollama       vectors       dossiers/ collab/
```

There are three runtime pieces:

- **Frontend.** A Vue 3 + TypeScript SPA built with Vite. It holds all
  knowledge about forms, answers, navigation and exports.
- **Backend.** A single FastAPI process. It handles login, stores dossiers,
  documents and images, indexes and searches documents, and runs the LLM
  prompts with their validation.
- **External services.** Keycloak for identity, an LLM provider (Azure OpenAI
  or Ollama), and persistent storage mounted at `/data`.

The backend does not know what a form looks like. Form definitions exist only
on the frontend. The backend stores answers as an opaque JSON blob and gets
questions sent to it one prompt at a time.

## Repository map

| Path | What lives there |
|---|---|
| `src/App.vue` | Auth gate, landing page, boot sequence (`fetchMe` → `loadFromServer`) |
| `src/components/AssessmentForm.vue` | Top-level screen switch: user management, dossier list, dossier detail, form views |
| `src/components/` | Views and widgets. `DossierDetail.vue` and `QuestionItem.vue` are the largest and serve as the reference components |
| `src/stores/assessmentStore.ts` | Dossiers, form state, answers, persistence, collab mirror |
| `src/stores/authStore.ts` | Current user, roles, login/logout |
| `src/models/Assessment.ts` | Types for forms, questions and answers (the form schema in TypeScript) |
| `src/services/` | Backend clients (`llmService`, `dossierService`), loaders (`formLoader`, `beslishulpLoader`), exports (`wordExport`, `legacyDocxExport`, `dataExport`) |
| `src/collab/` | Real-time collaboration: Y.Doc codec, `DossierDoc`, WebSocket transport, presence |
| `src/composables/` | Shared stateful logic: AI Modus, form progress, cross-form prefill |
| `src/utils/` | Pure, tested logic: beslishulp engine, toepassingsscan, tracks, URNs, answer HTML, source matching |
| `public/forms/` | Form definitions (JSON), `index.json` registry, `crossFormMappings.json` |
| `public/beslishulp/` | Built decision tree for the AI Act beslishulp |
| `backend/main.py` | App wiring, all LLM endpoints and system prompts, validation, document/image endpoints |
| `backend/auth.py` | Keycloak OIDC backend-for-frontend, `require_user`, `--dev` bypass |
| `backend/dossiers.py`, `dossierstore.py` | Dossier CRUD, sharing grants, `resolve_session_access` |
| `backend/collab.py` | Yjs WebSocket rooms (pycrdt), durable CRDT state |
| `backend/users.py`, `admin_users.py` | User search for sharing; user management via Keycloak Admin API |
| `backend/llm.py` | LLM backend abstraction (chat, stream, embed) |
| `backend/rag.py`, `pdfextract.py` | Chunking, LanceDB vector store, ontology extraction; structured PDF parsing |
| `backend/docstore.py`, `imagestore.py` | File-based document and image stores |
| `backend/textdedup.py` | Deterministic overlap helpers for the smoothing pass |
| `backend/eval_prompts.py` | Prompt eval harness |
| `scripts/` | Build-time converters: vendored YAML → form JSON / beslishulp JSON, plus JSON schema |
| `vendor/` | Upstream MinBZK sources (par-dpia-form, ai-verordening-beslishulp) with provenance |
| `opstelhulp/` | Local helpers for turning `.docx`/`.xlsx` templates into form JSON (not shipped) |
| `Dockerfile.*`, `nginx.conf`, `docker-compose.yml`, `azure-pipelines.yml` | Containers, local stack, CI/CD to Azure Container Apps |

## Frontend

### Screens without a router

The app has no router. `App.vue` shows one of three things: a loading gate, the
anonymous landing page, or `AssessmentForm`. `AssessmentForm` then picks a
screen from store state:

1. `auth.userManagementOpen` → `UserManagement`
2. `store.screen === 'dossierList'` → `DossierList`
3. `store.activeFormId === null` → `DossierDetail`, the dossier home with
   documents, form cards, the beslishulp and the toepassingsscan
4. otherwise a form, whose view comes from `store.currentView`: `home`
   (FormIntro), `risk` (RiskClassification), `decision` (DecisionGate),
   `summary` (SummaryView), or a section id (SectionView)

The boot order matters. `App.vue` calls `beginServerLoad()` before any child
component mounts, so `ensureDossier` cannot create an empty dossier before the
server list has arrived. The form also waits for `loadFromServer` to finish
before it mounts, so it does not close the collab sockets its editors just
opened.

### Forms are data

Forms are JSON files in `public/forms/`, fetched at runtime by `formLoader.ts`.
To add a form, add a JSON file and one entry in `index.json`. No rebuild is
needed. A form entry has:

- **`track`**: the lifecycle phase (`src/utils/tracks.ts`). This is the only
  grouping axis.
- **`domains`**: privacy, beveiliging, AI, data or project. This is a facet
  shown on the card, never a grouping.
- **`urn`**: `urn:nl:minfin:tr:<id>:<major.minor>`, plus an optional
  `registryUrn` pointing at the upstream MinBZK instrument (`formUrn.ts`).
- **Role scoping**: `index.json` `roles` limits which forms a realm role sees.
  This only filters the menu; it is not authorization.

Some forms are generated from vendored upstream YAML (`npm run forms:build`,
using `scripts/convert-form.mjs` and the overlays in `scripts/form-overlays/`).
The AI Act decision tree is built the same way (`npm run beslishulp:build`).

On top of the forms sit three pure engines in `src/utils/`, each with its own
tests:

- **`beslishulp.ts`** runs the MinBZK decision tree. It is a label machine with
  guards that are parsed into an AST at build time and never `eval`'d. The
  result is stored on a host form and supplies the AIIA risk classification.
- **`toepassingsscan.ts`** turns scan answers into *kenmerken*, and kenmerken
  into a verdict per form on whether it applies. The logic is three-valued:
  `onbekend` shows up as "mogelijk relevant", never as "niet van toepassing".
- **Cross-form mappings** (`crossFormMappings.json`) come in two modes. `copy`
  prefills empty questions when a form is opened (`useCrossFormPrefill`). The
  synthesize mode asks the LLM to rewrite a source answer for the target
  question.

### State and persistence

`assessmentStore` is the center of the app. A **dossier** is one project or
system. It holds:

- a `sessionId`, which scopes its documents, images and vectors on the backend
- `forms: Record<FormId, FormState>` with answers, source citations,
  attachment metadata, current view, completed sections, risk level, go
  decision, and the beslishulp/toepassingsscan runs

Persistence has three layers:

1. **Pinia persisted state (localStorage).** An offline cache that makes
   startup instant.
2. **Server dossier store.** `schedulePush` sends the whole dossier with a
   debounced `PUT /api/dossiers/:id`, and the latest write wins.
   `loadFromServer` pulls the list at startup. The server copy is the durable
   one; localStorage is only a cache.
3. **Live CRDT.** When a dossier is open, a Y.Doc is the live source of truth
   (see below). The store mirrors decoded snapshots from it and still pushes
   the JSON form to the server.

### Real-time collaboration

`src/collab/` connects each open dossier to `/api/collab/:dossierId` with
y-websocket.

- **`ydocCodec.ts`** is the only link between the Y.Doc and the JSON envelope.
  Rich text is stored as `Y.XmlFragment`, checkbox answers as `Y.Array`, and
  tables and other opaque values as plain strings (latest write wins). Other
  metadata goes into a `meta` map. `ydocCodec.test.ts` is the spec.
- **`DossierDoc`** is the only way to change a live dossier from code, used for
  AI Modus, copy and import. Typing does not go through it: Tiptap's
  Collaboration extension binds directly to the fragment, which gives
  character-level merging.
- **Awareness** carries presence (`usePresence`, `PresenceBar`), collaborator
  carets, and which question someone's AI Modus is writing (`useAiBusy`).

Background and lessons learned: `docs/realtime-collab-plan.md` and
`docs/spike-phase0-collab.md`.

### Answer representation

Rich-text answers are Tiptap HTML. An empty answer is `''`, never `<p></p>`.
`htmlRuns.ts` turns that HTML into styled runs for the Word export and into
Markdown for the improve-text round trip. Table answers are a JSON string, and
the LLM exchanges them as pipe-delimited rows (`tableAnswer.ts`). Image
attachments store only metadata in `FormState.attachments`; the bytes live on
the backend.

### AI features on the client

`llmService.ts` is the only client-side caller of the AI endpoints. It reads
SSE streams, maps retrieved chunks to `AnswerSourceMeta`, and runs the bulk
loops:

- **AI Modus** (`useAiMode.ts`): for each question in the form, call
  `/api/extract/rag/stream`, write the result through `DossierDoc`, record its
  sources, and attach extracted figures. Questions without a grounded answer
  are marked as unanswered. A final pass (`/api/smooth/form/stream`) removes
  repetition across answers.
- **Verbeter tekst**: `/api/improve/stream` on a single field.
- **Source highlighting** (`sourceMatching.ts`): fuzzy text matching between an
  answer and its chunks. Below `GROUNDING_THRESHOLD`, a source does not count
  as support.

Documents are parsed where it works best. `.docx`, `.xlsx`, `.pptx`, `.txt` and
`.md` are read in the browser (mammoth, xlsx, jszip) and sent as text to
`/api/documents/index`. PDFs go as binary to `/api/documents/upload`, where
`pdfextract.py` pulls out text, tables and figures.

### Exports

Exports are generated entirely on the client:

- `wordExport.ts`: a styled `.docx` report, including images
- `legacyDocxExport.ts`: the exact layout of the Intakeformulier 2.0 template
- `dataExport.ts`: JSON export and import (`version: '1'`, carries `formUrn`)

### Styling

`main.css` defines the project aliases (`--invulhulp-*`) on `:root`. The
components currently use the RVO / Utrecht CSS component library
(`@nl-rvo/component-library-css`, `rvo-*` / `utrecht-*` classes and
`@nl-rvo/assets` icons). `CLAUDE.md` names the NLDD web-component design system
(`<nldd-*>`) as the target for UI work. The two should be reconciled before
this section is treated as final.

## Backend

### Request pipeline

`main.py` builds the app in this order:

1. `FastAPI(dependencies=[Depends(auth.require_user)])`: every route requires a
   session, except `/api/auth/*`.
2. `SessionMiddleware`: a signed, HttpOnly cookie holds the OIDC flow state and
   the user identity. The browser never sees a token.
3. `CORSMiddleware`.
4. Routers: `auth`, `admin_users`, `dossiers`, `users`, `collab`. The LLM,
   document and image routes are defined directly in `main.py`.
5. Lifespan: warms up the LLM and embedding model in the background, starts the
   pycrdt WebSocket server, and flushes collab state on shutdown.

`python backend/main.py --dev` sets `DEV_AUTH_BYPASS` before `auth` is
imported, so every request runs as a fixed dev user with both roles.

### Authorization

There are two independent layers:

- **Realm roles** (Keycloak): `gebruiker`, `beheerder` (gates user
  management), and scope roles such as `projectmanagement` (menu filtering
  only).
- **Dossier grants** (`dossierstore.py`): `viewer < editor < owner`. A dossier
  always keeps at least one owner. `ownerSub` names the user whose storage
  directory holds the dossier's files, and it never changes.

The endpoints for documents, images and RAG are keyed by `session_id`.
`dossiers.resolve_session_access(request, session_id, minimum_role)` connects
that key to grants: it finds the dossier that owns the session, checks the
caller's role, and returns the storage `sub` to read or write under. Any new
endpoint keyed by `session_id` must go through it. The collab WebSocket makes
the same check (editor or higher) against the session cookie. Viewers read
through the REST snapshot instead.

### LLM pipeline

`llm.py` exposes an `LLMBackend` protocol with `chat`, `stream` and `embed`.
Exactly one backend is active per process: Azure OpenAI if
`AZURE_OPENAI_ENDPOINT` is set, otherwise Ollama.

Endpoints (streaming variants use SSE with `X-Accel-Buffering: no`):

| Endpoint | Purpose |
|---|---|
| `/api/improve[/stream]` | Rewrite one answer into formal Dutch, with a rationale |
| `/api/extract[/stream]` | Extract an answer from given document text |
| `/api/extract/rag/stream` | Retrieve top-k chunks for a question, then extract |
| `/api/synthesize[/stream]` | Rewrite source-form answers for a target question |
| `/api/smooth/stream`, `/api/smooth/form/stream` | Remove repetition across answers (batched on the server) |

The system is built to prefer an empty field over a made-up answer:

- System prompts are assembled per question type and field format
  (`_build_extract_system_prompt`, `_EXTRACT_FORMAT_BLOCKS`).
- The model answers in fixed tags such as `<antwoord>`. The sentinel
  *"Onvoldoende informatie in de brondocumenten."* means "no answer" and must
  be matched exactly.
- `_validate_suggestion` and `_validate_table_suggestion` check the parsed
  output deterministically. They clear placeholders, paraphrased no-info
  answers, and e-mail addresses, phone numbers or table cells that do not
  appear in the source text.

A prompt and its validator form one contract, so change both together.
`backend/eval_prompts.py` runs the prompts against real models.

### Documents and RAG

```
upload ─► (pdfextract: text/table/figure blocks) ─► rag.chunk_blocks
       ─► embed ─► LanceDB table chunks_v2 (session_id, doc_id, block_type, page, asset_id)
       ─► docstore JSON (text + ontology + chunk count)
       ─► figures ─► imagestore (asset_id links chunk → image)
retrieve(session_id, query, top_k, doc_ids) ─► fragments with labels/hints ─► prompt
```

- Chunks aim for about 1,600 characters (at most 3,200, at least 200). Tables
  are split with their header repeated.
- The table schema is fixed when the table is created. To change it, bump the
  table name (`chunks_v2`) instead of migrating, then re-upload the documents.
- `extract_ontology` asks the LLM for entities and relations. The frontend
  draws them with vis-network (`EntityGraph.vue`).
- Search is a brute-force vector scan filtered by `session_id`, which is fine
  at PoC scale.

### Storage

Everything durable is plain files under `/data`: an Azure mount in production,
the `backend_data` volume in compose, and `./data` locally.

| Path (env var) | Contents | Writer |
|---|---|---|
| `DOSSIERS_PATH` | `{dossier_id}.json`: envelope, opaque `forms` blob, grants | `dossierstore.py` (atomic tmp + rename) |
| `DOCS_PATH` | `{user_sub}/{doc_id}.json`: text, ontology | `docstore.py` |
| `IMAGES_PATH` | `{user_sub}/{image_id}.bin` + `.json` sidecar (PNG/JPEG, ≤ 5 MB) | `imagestore.py` |
| `COLLAB_PATH` | One binary Yjs update per dossier (debounced flush) | `collab.py` |
| `LANCEDB_PATH` | Vector tables. Must **not** be an SMB mount; use a local disk or `az://` Blob storage | `rag.py` |

There is no database. Identifiers are cleaned with `docstore._safe` before they
are used in a path. File I/O is synchronous and wrapped in
`asyncio.to_thread`.

## Deployment

- **Local development:** `vite` on :5173 proxies `/api` (including the
  WebSocket, via `ws: true`) to uvicorn on :8000, and Ollama runs on the host.
  `VITE_AUTH_BYPASS` and `--dev` skip Keycloak.
- **docker-compose:** `ollama`, `backend` and `frontend` (nginx on :8080).
  Keycloak runs as a separate stack and is reached over the external
  `keycloak-shared` network.
- **Production:** `azure-pipelines.yml` builds both images, pushes them to ACR,
  sets up persistent storage, deploys both Container Apps, and applies the
  frontend firewall rules.

`nginx.conf` contains production-only behavior that the vite proxy hides:

- Upgrade headers and a one-hour timeout on `/api/collab/`
- `client_max_body_size 30m` for PDF uploads
- `text/javascript` as the type for `.mjs` files
- `no-cache` on `/forms/` and `index.html`, so a new deploy never pairs a new
  bundle with an old form registry

## Cross-cutting conventions

- **Language:** code, comments and identifiers are in English. Everything a
  user or the LLM sees (UI, prompts, error details) is in Dutch. Some backend
  modules for Dutch-facing features have Dutch docstrings.
- **Backward compatibility of stored state:** new `FormState` fields are
  optional, and the store migrates older persisted shapes itself. Never assume
  a field exists on a loaded dossier.
- **Pure logic lives in `src/utils/`,** with tests next to it (Vitest). Keep
  components thin. Run `npm test` and `npm run build`, which includes vue-tsc.
- **Shared contracts:** these pairs must change together:
  - prompt ↔ validator ↔ sentinel
  - `ydocCodec` ↔ `FormState`
  - table JSON ↔ pipe-row format ↔ per-cell grounding
  - `index.json` track and role names ↔ `tracks.ts` / `auth.SCOPE_ROLES`
