# findocs: AI-assisted government compliance forms

> ⚠️ **Proof of concept.** This is an early proof of concept and not ready for production. We're looking for feedback and for people to work with on where it goes next, so get in touch or open an issue if you have ideas.

A web application that helps Dutch government employees fill in AI-related compliance assessments. It walks users through structured forms and uses an LLM (a local Ollama model or Azure OpenAI) to pull answers out of uploaded source documents, improve free text and combine answers across forms.

![findocs portal](docs/screenshots/portal.png)

## Features

- **20 forms grouped by project phase.** *Intake* (Intakeformulier) → *Aanbieding* (Projectaanbiedingsformulier) → *Initiatiefase* (PPM Projectplan, PSA, Quickscan BIO2, Prescan DPIA, DPIA, AI Impact Assessment, IAMA, EU AI Act Compliance Checklist, Data-ethiektoets, IHH-toets, Cloudtoets) → *Uitvoeringsfase* (Datakwaliteit-assessment, Dataset-registratie, AI-systeemregistratie/Model Card, Algoritmeregister-publicatie, Verwerkingsregister, Toegankelijkheidsverklaring, Restrisico-acceptatie) → *Afrondingsfase* (placeholders only so far). The phases follow the organisation's project phasing; Intake and Aanbieding are in the timeline but carry no phase number. Every form describes one project or system, matching the dossier that holds it. The subject domain (privacy, beveiliging, AI, data, project) is a tag on each card and does not group anything. [`docs/sporen-en-roadmap.md`](docs/sporen-en-roadmap.md) explains why and lists the instruments still missing. Forms are defined as JSON files under `public/forms/` and loaded at runtime. Every form records where it comes from and how closely it follows that source ([Form lineage](#form-lineage)), and carries a stable identifier in the shape the MinBZK task-registry uses for its instruments, such as `urn:nl:minfin:tr:dpia:3.0` ([Form URNs](#form-urns)).
- **Beslishulp AI-verordening (MinBZK).** The official [ai-verordening-beslishulp](https://github.com/MinBZK/ai-verordening-beslishulp) decision tree runs inside the app as a modal, launched from a tile fused to the EU AI Act card on the dossier page. It determines whether the AI-verordening applies, which role you hold (aanbieder, gebruiksverantwoordelijke, importeur, distributeur) and which risk group the system falls in, with the upstream explanations, sources and obligations intact. The outcome is stored on the dossier and supplies the risk classification (Bijlage 1) of the AI Impact Assessment. The decision tree is vendored (`vendor/ai-verordening-beslishulp/`, EUPL-1.2) and built into a runtime asset with `npm run beslishulp:build`.
- **Login via Keycloak (SSO).** The backend acts as an OpenID Connect backend-for-frontend: users log in through Keycloak, and a signed session cookie gates every API call. A `--dev` flag (backend) and `VITE_AUTH_BYPASS` (frontend) bypass the login for local development.
- **User management.** Beheerders (admins) can create, edit and delete users and reset their passwords from inside the app, through the Keycloak Admin API.
- **Dossiers.** Source documents and form answers are grouped into named dossiers, one per project, and you can switch between them. Dossiers are stored on the server with a debounced localStorage cache, so work carries over between devices and sessions. The local cache belongs to the account that logged in and is wiped at logout.
- **Dossier sharing.** Share a dossier with colleagues and assign a role: **viewer** (read-only), **editor** (fill in answers), or **owner**. Every session, document and image endpoint checks the caller's grant.
- **Real-time collaboration.** Several users can edit the same dossier at once. Answers sync live over a WebSocket using Yjs/CRDT (Tiptap Collaboration on the frontend, pycrdt on the backend), with collaborative carets in the editor and a presence bar showing who else is working in the dossier. Live editing requires the editor or owner role; conflicts merge automatically.
- **Source document upload.** Upload background documents (`.txt`, `.md`, `.docx`, `.xlsx`, `.pptx`, `.pdf`) so the AI can extract relevant answers per question.
- **Retrieval-augmented answers (RAG).** Uploaded documents are chunked and indexed in a LanceDB vector store. For each question the most relevant chunks are retrieved, the suggestion is based on them, and it cites the source.
- **Document ontology and entity graph.** The entities extracted from a dossier's documents, and how they relate, are shown as an interactive graph.
- **AI Mode.** One click fills in a whole form, question by question, from the uploaded source documents.
- **AI text improvement.** The "Verbeter tekst" button on every text field streams an improved version that keeps the formatting, plus a one-line rationale.
- **Answers** are written in a Tiptap editor (formatting, lists, Mermaid diagrams). Some questions take a table instead, where rows can be added and deleted and each cell is grounded separately. PNG and JPEG images can be attached to a question; they are stored on the server and included in the export.
- **EU AI Act risk classification.** Before the main AIIA questions, a Ja/Nee questionnaire determines the system's risk category under Regulation 2024/1689.
- **Prohibited AI systems.** If the classification comes out as "onaanvaardbaar risico" (prohibited under Art. 5 EU AI Act), the form can't be completed and says why.
- **Cross-form mapping.** AIIA answers are offered as suggestions for the related DPIA questions, so the same information isn't typed in twice.
- **Decision gates.** Certain forms (e.g. Prescan DPIA) route users to the full DPIA only when the screening outcome requires it.
- A sidebar shows the whole form and how far along it is, and you can jump to any section from it. Required questions are marked blue, supplementary ones green.
- **Word export.** A completed form downloads as a styled Word report. The Intakeformulier and PPM Projectplan 2.0 can also be exported into their original templates. Each export names the form definition it came from by URN, so a printed report can be traced to the exact instrument and version. JSON files saved by older versions can still be imported.
- AI output streams over Server-Sent Events. By default the LLM is a local Ollama instance, so no data leaves the machine; with `AZURE_OPENAI_ENDPOINT` set it uses Azure OpenAI instead.

### Screenshots

**Portal: dossier, source documents and form overview**
![Portal page](docs/screenshots/portal-docs.png)

**Form introduction page with AI Mode**
![Form intro](docs/screenshots/form-intro.png)

**EU AI Act risk classification questionnaire**
![Risk classification](docs/screenshots/risk-classification.png)

**Form questions with sidebar navigation and AI text improvement**
![Form questions](docs/screenshots/form-questions.png)

**Summary and export**
![Summary and export](docs/screenshots/summary.png)

## Gerelateerde tools

Het Ministerie van Binnenlandse Zaken en Koninkrijksrelaties (MinBZK) heeft een vergelijkbare tool ontwikkeld: [par-dpia-form](https://github.com/MinBZK/par-dpia-form). Beide tools zijn er om DPIA-formulieren digitaal in te vullen, maar ze zijn voor een andere situatie gebouwd.

| | **par-dpia-form** (MinBZK) | **findocs** (MinFin) |
|---|---|---|
| Formulieren | DPIA, Pre-scan DPIA | AIIA, DPIA, Pre-scan DPIA, en meer |
| Installatie | Geen: los HTML-bestand | Node.js + Python + Ollama/Azure OpenAI + Keycloak vereist |
| Hosting | Draait puur in de browser (GitHub Pages) | Vereist een lokale of gehoste server |
| AI-ondersteuning | Geen | Tekstverbetering, extractie uit documenten (RAG) en kruisformulier-synthese via LLM |
| Opslaan | Handmatig als JSON-bestand exporteren/importeren | Server-side dossiers met authenticatie en delen |
| Kruisformulier-koppeling | Niet aanwezig | AIIA-antwoorden pre-suggereren DPIA-antwoorden |
| Rijke tekstbewerking | Nee | Ja, via Tiptap |
| Formulierdefinities | YAML-bestanden | JSON-bestanden |

Met **par-dpia-form** vul je een DPIA in zonder iets te installeren: HTML-pagina openen, invullen, exporteren naar PDF. **findocs** past beter als je meerdere instrumenten na elkaar doorloopt (bijvoorbeeld eerst een AIIA en dan een DPIA die antwoorden daaruit overneemt), documenten wilt hergebruiken en AI wilt laten helpen bij het formuleren.

### Beslishulpen: een aanvullende categorie

Er zijn ook **beslishulpen** (kwalificatietools). Die vullen geen assessment in. Met een vragenboom bepalen ze *welke* regels en verplichtingen voor je AI-systeem gelden: of het onder de AI-verordening valt, wat je rol is (aanbieder, gebruiksverantwoordelijke, importeur, distributeur) en in welke risicocategorie het valt. Een beslishulp bepaalt dus welke instrumenten je moet doorlopen; findocs helpt ze daarna *invullen*.

Twee relevante voorbeelden:

- [**AI-Verordening Beslishulp**](https://github.com/MinBZK/ai-verordening-beslishulp) (MinBZK): bepaalt of en hoe de EU AI-verordening van toepassing is op een AI-systeem.
- [**AI & Algoritmes Kwalificatie Tool (AI AQT)**](https://algorithmaudit.eu/nl/technical-tools/implementation-tool/) (Algorithm Audit): classificeert algoritmische systemen tegen AI-verordening, AVG en kaders voor algoritmegovernance, inclusief identificatie, rol/status, risicocategorie en bijbehorende verplichtingen.

| | **AI-Verordening Beslishulp** (MinBZK) | **AI AQT** (Algorithm Audit) | **findocs** (MinFin) |
|---|---|---|---|
| Type | Beslishulp / kwalificatie | Beslishulp / kwalificatie | Invultool voor assessments |
| Doel | Bepalen of de AI-verordening van toepassing is | Identificeren en risico-classificeren van algoritmes (AI-verordening, AVG) | Invullen van AIIA, DPIA en meer |
| Werkwijze | Vragenboom (decision tree) | Dynamische vragenlijsten + venndiagram-output | Gestructureerde formulieren met AI-suggesties |
| Uitkomst | Risicoclassificatie + verplichtingenoverzicht | Classificatie + verplichtingen per rol/status/risico | Ingevuld assessment (Word-export) |
| AI-ondersteuning | Geen (regelgebaseerd) | Geen (regelgebaseerd) | LLM voor extractie, tekstverbetering en synthese |
| Installatie | Geen: in te bedden of gehoste webpagina; lokaal via `npm run dev`/Docker | Geen: gehoste webpagina (open source) | Node.js + Python + Ollama/Azure OpenAI + Keycloak vereist |
| Opslag | Sessie-gebaseerd, optionele PDF-export | Centrale opslag mogelijk voor expert-review | Server-side dossiers met authenticatie en delen |
| Licentie | EUPL-1.2 | EUPL-1.2 | EUPL-1.2 |

Gebruikelijk is dus: eerst een **beslishulp** om vast te stellen welke assessments verplicht zijn, daarna **findocs** (of par-dpia-form) om ze in te vullen.

Die eerste stap zit inmiddels in findocs zelf: de **AI-Verordening Beslishulp** van MinBZK is geïntegreerd als modal (zie [Features](#features)). De beslisboom wordt als gepinde kopie meegeleverd onder `vendor/ai-verordening-beslishulp/` en blijft daarmee herleidbaar tot de upstream bron; inhoudelijke vragen over de beslisboom horen bij MinBZK (ai-verordening@minbzk.nl), niet bij findocs.

## Form URNs

Every form carries a stable identifier in the shape the [MinBZK task-registry](https://github.com/MinBZK/task-registry) uses for its instruments:

```
urn:nl:<authority>:<registry>:<instrument>:<major>.<minor>
```

Upstream, `schemas/schema_instruments.json` pins instrument URNs to `^urn:nl:aivt:tr:[a-z]+:[0-9]+\.[0-9]+`: authority `aivt`, registry `tr` (e.g. `urn:nl:aivt:tr:iama:1.0`). This tool issues its URNs under its own authority, `minfin`, and keeps the registry segment `tr`. The identifiers have the same shape and can sit next to the upstream ones without writing into someone else's namespace:

```
urn:nl:minfin:tr:dpia:3.0
```

The instrument segment is the form id, the version segment the form's `version`. Announced forms that have no JSON yet (the placeholders in `index.json`) are pinned at `0.1`.

There are two separate fields:

| Field | Names | Present on |
|---|---|---|
| `urn` | *our* form definition | every form, incl. placeholders |
| `registryUrn` | the upstream task-registry instrument the form implements | only forms with a real counterpart there |

The URN lives in both `public/forms/index.json` and the form JSON itself; `src/utils/formUrn.ts` owns the convention (`buildFormUrn`, `parseFormUrn`, `FORM_URN_PATTERN`) and `src/utils/formUrn.test.ts` fails the build if the two drift apart, a URN is missing, or a version segment no longer matches the form's `version`. The URN is shown on the form card and the form intro page and goes into the Word cover metadata. JSON files from older versions carry it as `formUrn` / `formRegistryUrn`.

For the three **generated** forms (DPIA, Prescan DPIA, IAMA) the URN lives in `scripts/form-overlays/<name>.overlay.json` under `form`, so `npm run forms:build` keeps emitting it.

| Form | URN | Task-registry instrument |
|---|---|---|
| Intakeformulier | `urn:nl:minfin:tr:intake:2.0` | — |
| Projectaanbiedingsformulier | `urn:nl:minfin:tr:aanbiedingsformulier:2.0` | — |
| PPM Projectplan | `urn:nl:minfin:tr:ppm:2.0` | — |
| PSA | `urn:nl:minfin:tr:psa:1.0` | — |
| Quickscan BIO2 | `urn:nl:minfin:tr:quickscan:2.0` | — |
| Prescan DPIA | `urn:nl:minfin:tr:prescandpia:2.0` | — |
| DPIA | `urn:nl:minfin:tr:dpia:3.0` | — |
| AI Impact Assessment | `urn:nl:minfin:tr:aiia:2.1` | `urn:nl:aivt:tr:aiia:1.0` |
| IAMA | `urn:nl:minfin:tr:iama:2.0` | `urn:nl:aivt:tr:iama:1.0` |
| EU AI Act Compliance Checklist | `urn:nl:minfin:tr:euaiact:0.1` | `urn:nl:aivt:tr:ca:1.0` |
| Data-ethiektoets | `urn:nl:minfin:tr:dataethiek:1.0` | — |
| IHH-toets | `urn:nl:minfin:tr:ihhtoets:0.1` | — |
| Cloudtoets | `urn:nl:minfin:tr:cloudtoets:1.0` | — |
| BIA *(placeholder)* | `urn:nl:minfin:tr:bia:0.1` | — |
| Datakwaliteit-assessment | `urn:nl:minfin:tr:datakwaliteit:1.0` | — |
| Dataset-registratie (datasheet) | `urn:nl:minfin:tr:datasetregistratie:1.0` | — |
| AI-systeemregistratie (Model Card) | `urn:nl:minfin:tr:modelcard:0.1` | — |
| Algoritmeregister-publicatie | `urn:nl:minfin:tr:algoritmeregister:1.0` | — |
| Verwerkingsregister (AVG art. 30) | `urn:nl:minfin:tr:verwerkingsregister:1.0` | — |
| Toegankelijkheidsverklaring | `urn:nl:minfin:tr:toegankelijkheid:1.0` | — |
| Restrisico-acceptatie | `urn:nl:minfin:tr:restrisico:1.1` | — |
| Projectvoortgangsrapportage *(placeholder)* | `urn:nl:minfin:tr:voortgangsrapportage:0.1` | — |
| Projectafwijkingsformulier *(placeholder)* | `urn:nl:minfin:tr:afwijkingsformulier:0.1` | — |
| Evaluatieformulier *(placeholder)* | `urn:nl:minfin:tr:evaluatie:0.1` | — |
| Risico-impactformulier *(placeholder)* | `urn:nl:minfin:tr:risicoimpact:0.1` | — |

## Form lineage

Every form carries a `source` block in its JSON (typed as `FormSource` in `src/models/Assessment.ts`) recording the instrument it comes from, the publisher, the exact reference inside that source, and **how faithfully** it follows the original. Nothing at runtime uses it; it lets you trace an answer back to its instrument without going through git history.

The `derivation` field has four values:

| Value | Meaning |
|---|---|
| `generated` | Machine-converted from a vendored upstream definition. **Do not hand-edit the JSON**; edit the overlay and re-run `npm run forms:build`. |
| `harmonized` | Hand-built, but field-for-field aligned with a named external instrument; imported fields carry the upstream identifier as `officialId`. |
| `derived` | Modelled on a framework that ships no fill-in template. The concepts are the source's; the questions are ours. |
| `original` | Written for this tool or digitised from an internal MinFin template. No external original exists. |

| Form | Track | Original instrument | Publisher | Derivation |
|---|---|---|---|---|
| Intakeformulier | Intake | Intakeformulier IV-verzoek (intern sjabloon) | MinFin | `original` |
| Quickscan BIO2 | Initiatie | Classificatietoets BIO2 (`QIS BIO2 MinFin v1.0 - 10072026.xlsx`), op de [BIO2](https://bio-overheid.nl/)-handreiking dataclassificatie van de IBD | MinFin | `harmonized` |
| Prescan DPIA | Initiatie | Pre-scan DPIA v2.0 (`urn:nl:prescan`) | MinBZK | `generated` |
| Aanbiedingsformulier | Aanbieding | PPM-aanbiedingsformulier (intern sjabloon) | MinFin | `original` |
| Restrisico-acceptatie | Uitvoering | Geen extern origineel; sluitstuk van DPIA/AIIA/IAMA/BIO, naar het gangbare patroon van formele risicoacceptatie | MinFin | `original` |
| PPM Projectplan | Initiatie | PPM-Projectplan 2.0 | MinFin | `original` |
| PSA | Initiatie | Project Start Architectuur (intern sjabloon, NORA-lagen) | MinFin | `original` |
| Datakwaliteit-assessment | Uitvoering | DAMA-DMBOK2 hfdst. 13 (Data Quality); ISO/IEC 25012, DAMA-NL DDQ | DAMA International | `derived` |
| Dataset-registratie | Uitvoering | DAMA-DMBOK2 hfdst. 12 (Metadata Management); DCAT-AP-NL, MIM 1.2, "Datasheets for Datasets" | DAMA International | `derived` |
| DPIA | Initiatie | Model DPIA Rijksdienst v3.0 (`urn:nl:dpia`) | MinBZK | `generated` |
| AI Impact Assessment | Initiatie | [AI Impact Assessment v2.0](https://www.rijksoverheid.nl/documenten/rapporten/2022/11/30/ai-impact-assessment-ministerie-van-infrastructuur-en-waterstaat) | MinIenW | `harmonized` |
| IAMA | Initiatie | Impact Assessment Mensenrechten en Algoritmes v2 (`urn:nl:iama`) | MinBZK | `generated` |
| EU AI Act Compliance Checklist | Initiatie | AI-BOK v1.0 Template 3 + task-registry `conformity_assessment_eu_ai_act` (`urn:nl:aivt:tr:ca:1.0`) | Jan Willem van Veen / MinBZK | `harmonized` |
| Data-ethiektoets | Initiatie | DAMA-DMBOK2 hfdst. 2 (Data Handling Ethics), §3.1, Belmont-principes | DAMA International | `derived` |
| Cloudtoets | Initiatie | Handreiking gebruik clouddienst v1.0 (`Handreiking Toestaan Cloudtoepassingv1.0.docx`); Cloudbeleid MinFin, Rijksbreed Cloudbeleid 2022, implementatiekader 'risicoafweging cloudgebruik' | MinFin (Adviescommissie Cloudgebruik) | `harmonized` |
| IHH-toets | Initiatie | Informatiehuishoudingstoets bij IV-verzoeken (intern sjabloon CDIO/IHH); Archiefwet, RINFIN 2022, NEN-ISO 16175-1:2020, DUTO-raamwerk Nationaal Archief | MinFin (CDIO/IHH) | `harmonized` |
| AI-systeemregistratie (Model Card) | Uitvoering | AI-BOK v1.0 Template 2 | Jan Willem van Veen | `harmonized` |
| Algoritmeregister-publicatie | Uitvoering | [Algoritmeregister](https://algoritmes.overheid.nl/), standaard voor de publicatie van algoritmes | MinBZK | `harmonized` |
| Verwerkingsregister | Uitvoering | [AVG](https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX%3A32016R0679) art. 30 lid 1 (beveiliging: art. 32 lid 1) | Europese Unie | `derived` |
| Toegankelijkheidsverklaring | Uitvoering | Tijdelijk besluit digitale toegankelijkheid overheid; modelverklaring [DigiToegankelijk](https://www.digitoegankelijk.nl/) (Uitvoeringsbesluit (EU) 2018/1523), EN 301 549 / WCAG 2.1 AA | Rijksoverheid / Logius | `harmonized` |

The `source` blocks record two caveats as well. The **Algoritmeregister** and **Toegankelijkheidsverklaring** forms only *prepare* a publication. The official filing happens in the upstream register, and both upstream schemas change over time, so check the current fields before publishing. The three DAMA-derived forms borrow DAMA's concepts but none of its text, because DAMA-DMBOK2 is copyrighted and has no fill-in template. The AI-BOK templates may be freely used and adapted with attribution (p. 204).

The **organisation-level** forms (AI Governance Charter, AI Maturity Quick Scan, Shadow AI Inventory, Data Governance Charter, Data-management volwassenheidsscan) are left out on purpose, because a dossier describes one project or system. See [`docs/sporen-en-roadmap.md`](docs/sporen-en-roadmap.md) §3; the three that were built remain in git history.

## AI Body of Knowledge forms and MinBZK harmonization

Two of the forms come from the **AI Body of Knowledge (AI-BOK v1.0)** by Jan Willem van Veen, a reference framework for AI governance, lifecycle management and organisational design that follows ISO 42001, the NIST AI RMF and the EU AI Act. Its appendix has templates that fit findocs' JSON form schema without much work. Where an AI-BOK template overlaps with an official Dutch government instrument, the form is **harmonized** with the MinBZK schema for it, and each imported field keeps the upstream identifier as `officialId`. The DPIA, Pre-scan DPIA and IAMA were done the same way.

| Form | Track | AI-BOK source | MinBZK harmonization |
|---|---|---|---|
| EU AI Act Compliance Checklist | Initiatie | Template 3 | EU-conformiteitsverklaring (bijlage V / art. 47) folded in as the capstone section from task-registry `conformity_assessment_eu_ai_act` (`urn:nl:aivt:tr:ca:1.0`); each declaration field carries its URN as `officialId` |
| AI-systeemregistratie (Model Card) | Uitvoering | Template 2 | Field structure aligned with the MinBZK systemcard concept (naam, eigenaar, beschrijving); EU AI Act risk levels reused verbatim |

Three more AI-BOK templates (Governance Charter, Maturity Quick Scan, Shadow AI Inventory) were built and later removed. They describe an *organisation*, and a dossier describes one project or system.

Harmonization with MinBZK runs along **two tracks**, one per upstream schema:

- **[par-dpia-form](https://github.com/MinBZK/par-dpia-form)**: *form definitions (YAML)*. The DPIA, Pre-scan DPIA and IAMA are generated from the vendored upstream YAML by a build-time converter (`npm run forms:build`), so their content follows the official Model DPIA Rijksdienst and IAMA. See [`docs/SCHEMA_HARMONIZATION.md`](docs/SCHEMA_HARMONIZATION.md).
- **[task-registry](https://github.com/MinBZK/task-registry)**: *instrument/task registry (URN-keyed)*. The conformity-declaration section of the EU AI Act checklist reuses the `conformity_assessment_eu_ai_act` instrument (`urn:nl:aivt:tr:ca:1.0`). The registry also has AIIA, IAMA and technical-documentation instruments, and its explicit AIIA↔IAMA links could become cross-form mappings later.

All forms use the **cross-form synthesis**: 152 mappings in `public/forms/crossFormMappings.json`, so shared information is entered once. The EU AI Act checklist and the Model Card are pre-filled from AIIA, DPIA and PSA answers; the Verwerkingsregister fills almost entirely from the DPIA (the article 30 elements are already there), and the Algoritmeregister publication from the AIIA and the Model Card. See [`docs/cross-form-connecties.md`](docs/cross-form-connecties.md).

The inventories of candidate forms and the rationale behind which ones were built live in [`docs/AI-BOK-form-opportunities.md`](docs/AI-BOK-form-opportunities.md) (AI governance) and [`docs/DAMA-DMBOK-form-opportunities.md`](docs/DAMA-DMBOK-form-opportunities.md) (the data layer); the prioritised roadmap of what is still missing is in [`docs/sporen-en-roadmap.md`](docs/sporen-en-roadmap.md) §4.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite |
| Rich text editor | Tiptap (with Mermaid diagrams) |
| State management | Pinia (with persistence) + server-side dossiers |
| Real-time collaboration | Yjs (y-websocket + Tiptap Collaboration) ↔ pycrdt / pycrdt-websocket |
| Design system | NLDD Design System (`@nldd/design-system`, MinBZK) |
| Word export | docx |
| Graph visualisation | vis-network |
| Backend API | FastAPI (Python) |
| Authentication | Keycloak (OpenID Connect, BFF pattern) |
| Vector store / RAG | LanceDB |
| LLM inference | Ollama (local) or Azure OpenAI |

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Python](https://www.python.org/) 3.13+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Ollama](https://ollama.com/) running locally with a model pulled (default: `llama3.2`), **or** an Azure OpenAI resource
- [Keycloak](https://www.keycloak.org/) for the login flow, or the `--dev` bypass for local development

## Getting started

To run everything locally, start `python backend/main.py --dev` from the repo root. It skips the Keycloak login. The frontend needs `VITE_AUTH_BYPASS=true`, which `.env.development` already sets.

### 1. Pull the LLM model

```bash
ollama pull llama3.2
```

(Skip this if you use Azure OpenAI; see the environment variables below.)

### 2. Install frontend dependencies

```bash
npm install
```

### 3. Install backend dependencies

```bash
uv sync
```

### 4. Configure environment (optional)

Copy `.env.example` to `.env` to override defaults:

```bash
cp .env.example .env
```

Available variables:

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_MODEL` | `llama3.2` | Ollama model to use (when Azure is not configured) |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Ollama embedding model for RAG |
| `AZURE_OPENAI_ENDPOINT` | _(unset)_ | When set, Azure OpenAI is used instead of Ollama |
| `AZURE_OPENAI_API_KEY` | _(unset)_ | Azure OpenAI API key |
| `AZURE_OPENAI_DEPLOYMENT` | `gpt-5.3-chat` | Azure chat deployment name |
| `AZURE_OPENAI_API_VERSION` | `2025-04-01-preview` | Azure API version |
| `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` | _(unset)_ | Azure embedding deployment for RAG (may live on a separate resource) |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `OIDC_DISCOVERY_URL` | _(see `.env.example`)_ | Keycloak OpenID Connect discovery URL |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | `findocs-bff` / `dev-secret-change-me` | BFF client credentials |
| `OIDC_ADMIN_CLIENT_ID` / `OIDC_ADMIN_CLIENT_SECRET` | `findocs-admin` / … | Service-account client for user management (Keycloak Admin API) |
| `OIDC_REDIRECT_URI` | `http://localhost:8080/api/auth/callback` | OIDC redirect URI |
| `SESSION_SECRET` | `change-me-…` | Secret used to sign the session cookie (`openssl rand -hex 32`) |
| `SESSION_HTTPS_ONLY` | `false` | Set to `true` in production |
| `SESSION_MAX_AGE` | `43200` (12 h) | Session cookie lifetime in seconds |
| `SESSION_REVALIDATE_SECONDS` | `300` | How often a session's account (exists, enabled, roles) is re-checked against Keycloak |
| `LANCEDB_PATH` | `./data/lancedb` | LanceDB vector-store path |
| `DOCS_PATH` / `IMAGES_PATH` / `DOSSIERS_PATH` | `./data/...` | Persistent stores for documents, images, and dossiers |
| `COLLAB_PATH` | `./data/collab` | Durable Yjs/CRDT state for real-time collaboration (one binary file per dossier) |

See `.env.example` and `.env.azure.example` for the full set and inline notes.

### 5. Start the backend

For local development with the login bypassed:

```bash
uv run python backend/main.py --dev
```

Or run uvicorn directly (requires a reachable Keycloak):

```bash
uv run uvicorn main:app --app-dir backend --reload
```

The API runs at `http://localhost:8000`.

### 6. Start the frontend

```bash
npm run dev
```

The app runs at `http://localhost:5173`, with the login bypassed by `.env.development`.

## Running with Docker

```bash
docker compose up
```

This starts Ollama, the backend (FastAPI, port 8000), and the frontend (nginx, published on port **8080**) in containers, with a persistent volume for the LanceDB, document, image and dossier stores. Keycloak runs in a separate stack, reached over the external `keycloak-shared` network, so start that stack first. Set `OIDC_*`, `SESSION_SECRET`, and (optionally) the Azure OpenAI variables in your environment before bringing the stack up.

## API

All endpoints live under `/api` and require an authenticated session (except the auth routes themselves). Endpoints that touch a dossier's data verify the caller's grant (viewer/editor/owner).

### AI

| Endpoint | Method | Description |
|---|---|---|
| `/api/improve/stream` | `POST` | Suggest an improved version of a text fragment |
| `/api/synthesize/stream` | `POST` | Synthesize a DPIA answer from AIIA answers |
| `/api/smooth/form/stream` | `POST` | Deduplicate a whole form's longtext answers (batched server-side) |
| `/api/extract/rag/stream` | `POST` | Extract an answer grounded in retrieved document chunks (RAG) |

### Documents and images

| Endpoint | Method | Description |
|---|---|---|
| `/api/documents/index` | `POST` | Upload and index a source document |
| `/api/documents` | `GET` | List a dossier's indexed documents |
| `/api/documents/{doc_id}` | `DELETE` | Remove an indexed document |
| `/api/documents/verify` | `POST` | Verify document availability |
| `/api/images` | `POST` | Attach an image to a question |
| `/api/images/{image_id}` | `GET` · `DELETE` | Fetch or delete a question image |

### Dossiers, users and auth

| Endpoint | Method | Description |
|---|---|---|
| `/api/dossiers` · `/api/dossiers/{id}` | `GET` · `PUT` · `DELETE` | Manage dossiers |
| `/api/dossiers/{id}/grants/{sub}` | `PUT` · `DELETE` | Share/unshare a dossier with a user (assign a role) |
| `/api/collab/{dossier_id}` | `WS` | Real-time collaboration WebSocket (Yjs sync + presence; editor/owner only) |
| `/api/users/search` | `GET` | Search users to share with |
| `/api/admin/users` | `GET` · `POST` · `PUT` · `DELETE` | User management (beheerder only) |
| `/api/admin/users/{id}/reset-password` | `POST` | Reset a user's password |
| `/api/auth/login` · `/callback` · `/me` · `/logout` | `GET` | Keycloak OIDC BFF flow |

## Source documents

| Document | Source |
|---|---|
| AI Impact Assessment (IenW, v2.0) | [rijksoverheid.nl](https://www.rijksoverheid.nl/documenten/rapporten/2022/11/30/ai-impact-assessment-ministerie-van-infrastructuur-en-waterstaat) |
| Model DPIA Rijksdienst (v3.0) | [kcbr.nl](https://www.kcbr.nl/sites/default/files/2023-09/Model%20DPIA%20Rijksdienst%20v3.0.pdf) |
| AI Body of Knowledge (AI-BOK v1.0) | Jan Willem van Veen, 2026, `AI-Body-of-Knowledge-EN-v4.pdf` |
| EU-conformiteitsverklaring instrument (`urn:nl:aivt:tr:ca:1.0`) | [MinBZK/task-registry](https://github.com/MinBZK/task-registry/blob/main/instruments/conformity_assessment_eu_ai_act.yaml) |
| DAMA-DMBOK2: Data Management Body of Knowledge (2nd Ed., 2017) | DAMA International, `DAMA-DMBOK (2nd Edition) Data Management Body of Knowledge (DAMA International).pdf` |
| Algemene verordening gegevensbescherming (AVG), art. 30 | [eur-lex.europa.eu](https://eur-lex.europa.eu/legal-content/NL/TXT/?uri=CELEX%3A32016R0679) |
| Model toegankelijkheidsverklaring; EN 301 549 / WCAG 2.1 AA | [digitoegankelijk.nl](https://www.digitoegankelijk.nl/) |
| Standaard voor de publicatie van algoritmes | [algoritmes.overheid.nl](https://algoritmes.overheid.nl/) |

Which instrument each form comes from, and how closely it follows it, is in the `source` block of every form JSON and in the [Form lineage](#form-lineage) table.

## Real-time collaboration internals

Changes show up for everyone straight away and conflicts merge through Yjs/CRDT.

- **One Yjs document per dossier**, synced over `/api/collab/{dossier_id}` (y-websocket protocol). The backend (`backend/collab.py`, on pycrdt) only transports and merges; it knows nothing about the dossier structure.
- **Auth over the same session cookie** as the REST API; live editing needs the **editor** or **owner** role (viewers get the read-only REST snapshot). An open connection is closed within 30 seconds of losing that role.
- **The first client seeds the room** from the stored dossier JSON (`src/collab/ydocCodec.ts`); the JSON dossier store is still where dossiers are saved, and the server also writes the raw CRDT state to `COLLAB_PATH` (debounced) so a restart keeps edits that were in flight.
- **Tiptap Collaboration + Collaboration Caret** bind each rich-text answer to a shared fragment, and `src/collab/usePresence.ts` drives the presence bar via Yjs awareness.
- In production, nginx must forward WebSocket `Upgrade` headers for `/api/collab` (see `nginx.conf`); the Vite dev proxy does this for you.

See `docs/realtime-collab-plan.md` for the full design and phase plan.

## License

Licensed under the [European Union Public Licence v1.2 (EUPL-1.2)](LICENSE).
