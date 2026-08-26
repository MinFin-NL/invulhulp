# Schema harmonization with MinBZK/par-dpia-form

_Last updated: 2026-07-28_

## Why

We want our DPIA question content to track the **official government source** instead of being
hand-maintained. That source is [MinBZK/par-dpia-form](https://github.com/MinBZK/par-dpia-form),
which encodes the **Model DPIA Rijksdienst** as YAML. Our app already described its DPIA as
"conform het Model DPIA Rijksdienst", so the content is meant to be the same thing — this change
makes that link explicit and reproducible.

The two projects are architecturally close (Vue 3, Pinia, Keycloak, pdfmake; par-dpia-form is
still on the RVO design system, where this app has moved to NLDD)
but their **form schemas differ fundamentally**:

| | Our app (findocs) | par-dpia-form |
|---|---|---|
| Format | JSON in `public/forms/` | YAML in `sources/` |
| Model | fixed 3 levels: `section → subsection → question` | recursive `tasks` tree (`task_group`, `repeatable`) |
| Types | `text` / `radio` / `checkbox` / `table` | `open_text`, `text_input`, `select_option`, `checkbox_option`, `radio_option`, `task_group`, `date`, `image`, … |
| Conditionals | `followUp` + bespoke `goDecision` nav gate | `dependencies` engine (`conditional` / `source_options` / `instance_mapping`) |
| Validation | none (cast on load) | JSON Schema |
| Answer keys | question `id` (`d1.1`) | official task `id` (`2.1.4`) |

**Chosen approach:** a build-time **converter** turns the vendored upstream YAML into our runtime
JSON. We did **not** adopt their engine or rewrite our renderers. Content tracks upstream; our
UI, stores, exports and backend stay unchanged.

## Key finding — upstream is a newer, richer model (v3.0)

Our previous hand-written `public/forms/dpia.json` is a simplified DPIA (Deel A–D, ~46 questions,
ids `d1.1`…`d17.5`). The pinned upstream `dpia.yaml` is the **Model DPIA Rijksdienst v3.0**:
20 numbered paragraphs, ~91 leaf questions, and heavy use of **repeatable, relational**
task-groups (e.g. "for each gegevensverwerking, repeat these fields"). It is not a rename of our
old form — it is a genuinely different, larger question set.

Consequence: the plan's original idea of "keep our `d*` ids 1:1 with a translation map" is **not
achievable**, because most upstream questions have no counterpart in our old form. So:

- The generated form uses ids derived from the upstream numbering: `d` + official id →
  `d2.1.4`. Every question also carries `officialId` (the raw upstream id) for cross-tool
  traceability.

## Promotion (done — pre-launch replace)

There was no production DPIA data, so v3.0 **replaced** the old form in place:

- The converter writes directly to `public/forms/dpia.json` (form id stays `dpia`), so the app
  serves v3.0 immediately. The old hand-written content is gone (recoverable from git history);
  the previous `dpia.v3.json` staging file was removed.
- `public/forms/index.json` was left unchanged — its `dpia` entry already points at `dpia.json`.
- `crossFormMappings.json` was **remapped** onto v3 ids (see below), so the AI cross-form fill
  keeps working. No code hardcodes DPIA question ids, so nothing else needed changing.

> **Local dev note:** two dossiers under `backend/data/dossiers/*.json` still hold answers keyed
> by *old* DPIA ids (e.g. `d3.1`). Under v3.0 those may render as stale/empty. This is local dev
> state only — clear those dossiers' `dpia` answers if the leftovers are distracting. No
> production data was affected.

### Cross-form mapping remap

`crossFormMappings.json` referenced old DPIA ids both as synthesis **targets** (from aiia/ppm/psa/
quickscan/prescandpia → dpia) and as **sources** (dpia → aiia). All were remapped (22 target refs,
19 source refs) onto valid v3 ids. Because v3's structured data now lives in **tables** — which are
not sensible free-text synthesis targets — narrative mappings were redirected onto v3's matching
`text` fields (mostly the per-paragraph "Aanvullende informatie …" fields). Several old ids
therefore collapse onto one v3 field (e.g. old `d17.1` technical + `d17.2` organisational measures
→ v3 `d17.2`). The full table lives in the git diff of `crossFormMappings.json`; **these mappings
are judgment calls and should be reviewed** by someone who knows the DPIA intent.

## What changed in this repo

### New files
| Path | What it is |
|---|---|
| `vendor/par-dpia-form/dpia.yaml` | Pinned snapshot of upstream `sources/dpia.yaml` (commit `3d76a6d`, 2026-07-23). |
| `vendor/par-dpia-form/PROVENANCE.md` | Source URL, pinned commit, refresh + licensing notes. |
| `scripts/convert-form.mjs` | The converter (Node ESM). |
| `scripts/form-overlays/dpia.overlay.json` | Hand-authored: our presentation (`meta`/`homeContent`/`aiContext`/`features`) + the mapping of upstream paragraphs into Deel A/B/C/D. |
| `scripts/schemas/findocs-form.schema.json` | JSON Schema for **our** `FormConfig`; the converter validates output against it and fails the build on mismatch. |
| `scripts/form-overlays/dpia.dropped-dependencies.json` | Generated report of every lossy conversion (see below). |
| `docs/SCHEMA_HARMONIZATION.md` | This document. |

### Modified files
| Path | Change |
|---|---|
| `src/models/Assessment.ts` | Added optional `officialId?: string` to `Question` (purely additive; no runtime behaviour depends on it). |
| `package.json` | Added `forms:build` script; added dev-deps `yaml`, `ajv`. |
| `public/forms/dpia.json` | **Regenerated as Model DPIA Rijksdienst v3.0** (was the hand-written v2 form). Now produced by `npm run forms:build`. |
| `public/forms/crossFormMappings.json` | DPIA target + source refs remapped onto v3 ids. |

### Unchanged (proves the low blast radius)
`formLoader.ts`, `QuestionItem.vue`, `TableQuestion.vue`, all exports, `assessmentStore.ts`,
`public/forms/index.json`, the whole Python backend. No runtime code changed except the additive
`officialId` field. All 31 unit tests still pass.

## How the converter maps the schema

Run: `npm run forms:build` (→ `node scripts/convert-form.mjs dpia`).

**Structure**
- Upstream paragraph (top-level `task_group`) → **Subsection**; the overlay assigns each paragraph
  to a Deel A/B/C/D/summary **Section**.
- Non-repeatable `task_group` inside a paragraph → **flattened** (its leaf children become
  questions).
- Repeatable `task_group` of leaf fields → **`table`** question, one column per child field.
- Relational wrappers (`instance_mapping`, e.g. "repeat per gegevensverwerking") are **collapsed**:
  the converter descends to the inner row template and emits a single table.

**Types**
| Upstream | Ours |
|---|---|
| `open_text`, `informational` | `text` |
| `text_input` | `text` + `format: shorttext` |
| `date` | `text` + `format: date` |
| `image` | `text` + `allowAttachments: true` |
| `select_option`, `radio_option` | `radio` (options preserved verbatim) |
| `checkbox_option`, `multiselect_scrollable` | `checkbox` (options preserved verbatim) |

**Options** are copied byte-for-byte (`label ?? value`) — never reworded, because the backend LLM
grounding enforces exact-match against option strings.

**Restored reactive behaviour** (added after the first pass — see "Fidelity restoration" below):
- `conditional` → question-level **`visibleIf`** (19 restored).
- `source_options` → **`optionsFrom`** dynamic dropdowns (18 restored), plus static select/checkbox
  options rendered as real dropdowns (incl. table columns).

**Still lossy (recorded, not silent)** — 12 in the current run, in
`scripts/form-overlays/dpia.dropped-dependencies.json`:
- `conditional_column` (6): a show-if condition *between columns of the same table row* — per-cell
  visibility we don't render; kept as a column hint.
- `instance_mapping` (6): per-instance relational repetition, collapsed into a single flat table.

**Result of the current run:** 5 sections, 21 subsections, 91 questions, 19 `visibleIf`,
18 `optionsFrom`, 29 select/suggest columns, 0 warnings, all ids unique, passes schema validation.

## Fidelity restoration (`visibleIf` + `optionsFrom`)

To recover the upstream form's reactivity within our (deliberately non-relational) model:

- **`Question.visibleIf`** `{ questionId, equals }` — a question renders only when another answer
  matches. The converter emits it for standalone conditionals (all of §15's rechten follow-ups,
  the §12 special-category tables gated by a radio). Evaluated in `src/utils/answerRefs.ts` and
  applied in `SectionView.vue` (hidden questions don't render).
- **`optionsFrom`** `{ questionId, column? }` on a question or a table column — options are read
  live from another answer (e.g. §3's "Persoonsgegevens" column suggests the values you typed in
  §2's table). `TableColumn.type` `select`/`suggest` renders a dropdown / datalist cell.
- **AI Modus respects visibility.** `bulkExtractFromDocument` takes a `shouldAnswer` predicate,
  re-checked live per question, so it never spends an LLM call on a hidden field and picks up any
  that become visible once their controller is filled (the flattened order puts controllers first).
  See `useAiMode.ts`.

Files touched for this: `src/models/Assessment.ts` (types), `src/utils/answerRefs.ts` (+ test),
`src/components/SectionView.vue`, `QuestionItem.vue`, `TableQuestion.vue`,
`src/composables/useAiMode.ts`, `src/services/llmService.ts`, and the converter/schema.

**Two behaviours we intentionally did not build** (they'd need a relational answer store — the
widest-blast-radius change in the app): per-cell conditional columns (6) and `instance_mapping`
(6). These remain flattened with notes.

## How to refresh from upstream

1. Bump the pinned file + SHA per `vendor/par-dpia-form/PROVENANCE.md`.
2. `npm run forms:build` (now builds **all three** generated forms: dpia, prescandpia, iama).
3. Review `git diff public/forms/*.json` and the dropped-dependencies reports.

## Extension to Pre-scan DPIA + IAMA (2026-07-28)

The same converter was pointed at the other two assessments in `MinBZK/par-dpia-form`
(`sources/prescan.yaml`, `sources/iama.yaml`) — the only two of our forms with an upstream
counterpart. Pre-scan DPIA **replaced** our old hand-written prescan (same instrument); IAMA was
added as a **new form** next to the existing AIIA (different instrument — see below). The other five
forms (intake, aanbiedingsformulier, ppm, psa, quickscan) are MinFin/BIO-specific and have no MinBZK
source.

**Naming:** each vendored file is named after *our* form id — `vendor/par-dpia-form/prescandpia.yaml`
(= upstream `prescan.yaml`) and `iama.yaml` (= upstream `iama.yaml`) — so the converter's single
`name` argument selects yaml + overlay + `public/forms/<name>.json` together. `prescandpia` reuses its
existing `index.json` entry; `iama` got a new one (assessment track, order 4). See `PROVENANCE.md` for
the local↔upstream mapping.

### Converter changes (all additive; DPIA output is byte-for-byte unchanged, re-verified)
- **Subsection ids resolve at any depth via `byId`.** DPIA/prescan list their top-level tasks as
  "paragraphs"; IAMA's top level is coarse (`Deel 1-5`) so its overlay lists the *second-level*
  themes (`1.1`, `2.2A`, `5.A`, …) — each becomes a subsection instead of one giant flat card per Deel.
- **Empty `task_group` leaves** (informational/heading nodes with no input, e.g. IAMA's `1.3.3`
  "Stop…" and `4.3.0` "Instructie") are **omitted** instead of emitted as bogus empty text fields,
  and recorded as `informational` in the dropped report.
- **Group-level conditionals are recorded** (`group_conditional`) when a flattened group or a listed
  subsection carries a show-if we can't re-express (IAMA `2.2A`/`2.2B` — the zelflerend vs
  niet-zelflerend branch — both stay visible).
- **Empty-`task` leaves** fall back to their parent group's label instead of showing the raw id
  (IAMA `2.1.1.1`).

### Pre-scan DPIA (`prescandpia`) — clean match
Upstream **Pre-scan DPIA v2.0** (`urn:nl:prescan`). Same instrument as ours, richer content
(internationale doorgiften/DTIA, basisregistraties, algoritmes/AI, kinderrechten).
**Result:** 4 sections, 12 subsections, 39 questions, 20 `visibleIf`, 0 warnings, 0 still-lossy.
**One deliberate loss:** upstream carries a top-level `assessments` **rules-engine** that
auto-computes which follow-up assessments (DPIA/DTIA/IAMA) are required. Our model has no such
engine, so the pre-scan captures the same questions but the "is a full DPIA needed" conclusion
stays a human judgement (as it already was).

### IAMA (`iama`) — added as a NEW form, alongside AIIA (not a replacement)
Upstream **Impact Assessment Mensenrechten en Algoritmes v2** (`urn:nl:iama`). The IAMA is a
grondrechten/human-rights dialogue instrument (aligned with AI-Act art. 27) and is a *different*
instrument from our hand-written MinFin AIIA (an EU-AI-Act risk-classification form with the bespoke
`riskClassification` / `decisionGate` / `conditionalPartB` features). Rather than overwrite the AIIA,
IAMA was added as a **new, separate form** (`id: iama`, `public/forms/iama.json`, `index.json`
assessment track order 4). The AIIA (`aiia.json`) is **untouched** — verified byte-for-byte identical
to HEAD.
- Because IAMA has no risk-classification or decision gate, its `features` are simply all off; it is a
  flat question set across `Deel 1-5`. That is the nature of the instrument, not a lost feature.
- **`Deel 0` (Inleiding)** is intentionally omitted (informational only); its text lives in
  `homeContent`.
- **Result:** 5 sections (A/B/C/D/summary = Deel 1-5), 25 subsections, 83 questions, 2 `visibleIf`,
  0 warnings, 4 still-lossy (2 `informational` = `1.3.3`/`4.3.0`, 2 `group_conditional` =
  `2.2A`/`2.2B`, the zelflerend vs niet-zelflerend branch, both kept visible).

### Cross-form mappings
`crossFormMappings.json` only changed on the **prescandpia** side; **aiia entries were left exactly as
they were** (the AIIA form still exists with its original ids), and the DPIA side was already stable.
The new `iama` form has **no cross-form mappings yet** — see "Where mappings come from" below.

- **quickscan→prescandpia** (2 entries): targets remapped onto new ids (`d1.1.2`, `d0.2`).
- **prescandpia→dpia**: **rebuilt from the authoritative upstream source.** par-dpia-form's
  `prescandpia.yaml` carries a `references:` field on each task — 20 typed prescan→DPIA links
  (`one-to-one` / `one-to-many` / `pre-fill` / `pre-view`). We replaced the earlier hand-authored
  guesses with these. **Only 6 of the 20 could be adopted**, producing 3 target-centric entries:
  `d0.2 → d1.1` (beschrijving→voorstel), `{d0.5.2,d0.5.3,d0.5.4,d6.1.1} → d4` (cloud + algoritme →
  technieken/methoden), `d1.2.1 → d12.1.1` (bijzondere pg). Each `synthesisHint` cites its upstream
  reference.
  - **Why only 6/20:** the other 14 references point at DPIA fields that our **v3 conversion collapsed
    into tables** (e.g. `2.1.3`, `5.1.1`, `12.1.2.4`, `16.1.1`). They resolve to a real *table*
    question, but the synthesize flow can't fill tables (`QuestionItem.vue` suppresses cross-form
    suggestions on `type: table`), so such mappings would be **dead data**. They are authoritative but
    not representable in v3 — recorded here rather than fabricated. If the DPIA ever moves away from
    collapsed tables (or the tool gains table-fill from a scalar source), they can be adopted directly.

**Every mapping ref was validated to resolve to a real question in every form; none of the new
prescan→DPIA entries target a table.** (Unrelated pre-existing issues, out of scope: one
`dpia→aiia` entry targets a table in the hand-written AIIA, and `aanbiedingsformulier`'s own mapping
refs were already broken at HEAD.)

### Where mappings come from (authoritative sources)
Cross-instrument relationships are **defined upstream**, in two MinBZK repos with different schemas:
- **`par-dpia-form`** (the form-definition repo we vendor): a `references:` field on tasks. Used above
  for prescan→DPIA. DPIA tasks themselves carry none.
- **`MinBZK/instrument-registry`** (the overarching task/measure/requirement registry, different
  flat schema, URN ids): a `links:` array on every task pointing at other instruments' task URNs.
  There the **AIIA and IAMA are separate instruments** (`urn:nl:aivt:tr:aiia:1.0` vs `…:iama:1.0`)
  with **61 explicit AIIA↔IAMA links**, plus IAMA→DPIA (partly free-text). Deriving our IAMA↔AIIA/DPIA
  mappings from those links is a good next step but needs a URN→our-id crosswalk **and** version
  reconciliation: the registry's IAMA is **v1** (57 tasks) while our `iama` form is par-dpia-form
  **v2** (83 questions, renumbered). Not done yet.

### Still to review (owner: privacy/AI/grondrechten expert)
1. **IAMA content** (`public/forms/iama.json`) — the flattened `Deel 1-5`, the omitted `Deel 0`, and
   the two always-visible `2.2A`/`2.2B` branches (`iama.dropped-dependencies.json`).
2. **IAMA/AIIA cross-form mappings from `instrument-registry` `links`** — build the URN→id crosswalk
   and reconcile IAMA v1 (registry) vs v2 (our form) so the 61 authoritative AIIA↔IAMA links (and
   IAMA→DPIA) can be adopted. None exist yet.
3. **The 14 prescan→DPIA references we couldn't adopt** — decide whether to redirect them onto DPIA
   narrative text fields (as the DPIA promotion did for the old mappings) or to leave them until the
   DPIA tables / table-fill change.
4. **The prescan `assessments` engine** — decide whether the manual "conclusie" is enough or the
   auto-recommendation deserves a real feature.
5. **IAMA subsection grouping** in `iama.overlay.json` (which second-level themes became subsections).
6. **Two more instruments available** in `instrument-registry` (flat schema, would need a second
   converter): EU-conformiteitsverklaring (`ca`, 8 tasks) and Technische documentatie hoog-risico AI
   (`td`, 29 tasks).

## Next steps

1. **Review the generated form** (`public/forms/dpia.json`) with a privacy/DPIA expert —
   especially the collapsed relational tables (§2, 3, 5–13, 17) and the 58 dropped dependencies.
   Decide per case whether the flattened representation is acceptable or needs a manual overlay tweak.
2. **Review the remapped cross-form mappings** (`crossFormMappings.json` git diff) — the old→v3
   redirections and collapses are judgment calls; confirm each still makes sense for the DPIA.
3. **Clear stale local dev dossiers** (optional): the two `backend/data/dossiers/*.json` with old
   `dpia` answer keys can be reset so they don't show orphaned answers under v3.0.
4. **Consider a UI affordance for the collapsed conditionals.** If the "Alleen relevant indien…"
   guidance proves clunky, the cheapest real fix is extending our model with a lightweight
   per-question `visibleIf` — a separate, larger change deliberately out of scope here.
5. **Optionally validate the live form loader** against `scripts/schemas/findocs-form.schema.json`
   (add ajv to `loadForm` in dev) so hand-edited forms get the same safety net as generated ones.
6. **Extension to Pre-scan DPIA and IAMA — done (2026-07-28).** See the dedicated section below.
   Prescan was a clean in-place match; IAMA is a *different* instrument from the AIIA, so it was added
   as a **new form** (`iama`) alongside the untouched AIIA. Content still needs expert review.
