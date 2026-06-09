# findocs – AI-assisted Government Compliance Forms

> ⚠️ **Proof of Concept** — This project is an early-stage proof of concept and is not production-ready. We are very much looking for direction, feedback, and collaboration on where to take it next. Please reach out or open an issue if you have ideas.

A web application that helps Dutch government employees fill in AI-related compliance assessments. It guides users through structured forms and uses a locally running LLM to suggest text improvements and synthesize answers across forms.

![findocs portal](docs/screenshots/portal.png)

## Features

- **8 forms across three tracks** — Project (Intakeformulier, Aanbiedingsformulier, PPM Projectplan, PSA), Assessments (Prescan DPIA, DPIA, AI Impact Assessment), and Compliance (Quick scan BIO).
- **Dossier management** — Group source documents and form answers into named dossiers; switch between dossiers to work on separate projects simultaneously.
- **Source document upload** — Upload background documents (`.txt`, `.md`, `.docx`, `.xlsx`) so the AI can extract relevant answers per question.
- **Rich text editor** — Tiptap-powered editor for every free-text answer, supporting formatting, lists, and more.
- **AI text improvement** — A "Verbeter tekst" button on every text field sends the current answer to a locally running LLM, which returns an improved version with a brief rationale.
- **AI Mode** — One-click automation that fills in an entire form automatically, question by question, drawing on the uploaded source documents.
- **EU AI Act risk classification** — Built-in guided questionnaire (5 questions, Ja/Nee) that determines the risk category of an AI system under Regulation 2024/1689 before the main AIIA questions.
- **Cross-form mapping** — Relevant AIIA answers are used to pre-suggest answers for related DPIA questions, eliminating duplicate work across assessments.
- **Section navigation** — A persistent sidebar shows the full form structure, progress indicator, and allows jumping to any section at any time.
- **Progress tracking** — Per-form completion percentage shown in the nav header and sidebar.
- **Required vs. supplementary fields** — Questions are colour-coded: blue = required, green = supplementary.
- **PDF, Word, and JSON export** — The summary view lets you download the completed form as a PDF, Word document, or raw JSON.
- **Persistent state** — All answers are auto-saved in the browser via Pinia persisted state; no manual save required.
- **Decision gates** — Certain forms (e.g. Prescan DPIA) route users to the full DPIA only when the screening outcome requires it.
- **Forbidden AI system guard** — If the risk classification yields "onaanvaardbaar risico" (prohibited under Art. 5 EU AI Act), the form blocks further completion and shows a clear error.
- **Local LLM inference** — All AI features run against a locally hosted Ollama instance; no data leaves the machine.

### Screenshots

**Portal — dossier, source documents, and form overview**
![Portal page](docs/screenshots/portal-docs.png)

**Form introduction page with AI Mode**
![Form intro](docs/screenshots/form-intro.png)

**EU AI Act risk classification questionnaire**
![Risk classification](docs/screenshots/risk-classification.png)

**Form questions with sidebar navigation and AI text improvement**
![Form questions](docs/screenshots/form-questions.png)

**Summary and export (PDF / Word / JSON)**
![Summary and export](docs/screenshots/summary.png)

## Gerelateerde tools

Het Ministerie van Binnenlandse Zaken en Koninkrijksrelaties (MinBZK) heeft een vergelijkbare tool ontwikkeld: [par-dpia-form](https://github.com/MinBZK/par-dpia-form). Beide tools richten zich op het digitaal invullen van DPIA-formulieren, maar ze zijn gebouwd voor andere contexten en hebben een ander uitgangspunt.

| | **par-dpia-form** (MinBZK) | **findocs** (MinFin) |
|---|---|---|
| Formulieren | DPIA, Pre-scan DPIA | AIIA, DPIA, Pre-scan DPIA, en meer |
| Installatie | Geen — standalone HTML-bestand | Node.js + Python + Ollama vereist |
| Hosting | Draait puur in de browser (GitHub Pages) | Vereist een lokale of gehoste server |
| AI-ondersteuning | Geen | Tekstverbetering en kruisformulier-synthese via LLM |
| Opslaan | Handmatig als JSON-bestand exporteren/importeren | Automatisch in de browser (Pinia) |
| Kruisformulier-koppeling | Niet aanwezig | AIIA-antwoorden pre-suggereren DPIA-antwoorden |
| Rijke tekstbewerking | Nee | Ja, via Tiptap |
| Formulierdefinities | YAML-bestanden | JSON-bestanden |

**par-dpia-form** is ideaal als je een DPIA wil invullen zonder enige installatie of infrastructuur: open de HTML-pagina, vul in, exporteer naar PDF. **findocs** is geschikter wanneer je meerdere compliance-instrumenten in samenhang wil doorlopen (bijv. eerst een AIIA, daarna een DPIA waarbij relevante antwoorden al worden overgenomen) en daarbij AI-hulp wil inzetten voor het formuleren van antwoorden.

### Beslishulpen: een aanvullende categorie

Naast invultools bestaan er ook **beslishulpen** (kwalificatietools). Deze vullen geen assessment in, maar helpen je via een vragenboom bepalen *welke* regelgeving en verplichtingen op jouw AI-systeem van toepassing zijn — bijvoorbeeld of het onder de AI-verordening valt, wat je rol is (aanbieder, gebruiksverantwoordelijke, importeur, distributeur) en in welke risicocategorie het systeem valt. Ze zijn complementair aan findocs: een beslishulp bepaalt de *scope* (welke instrumenten je moet doorlopen), findocs helpt vervolgens bij het daadwerkelijk *invullen* ervan.

Twee relevante voorbeelden:

- [**AI-Verordening Beslishulp**](https://github.com/MinBZK/ai-verordening-beslishulp) (MinBZK) — bepaalt of en hoe de EU AI-verordening van toepassing is op een AI-systeem.
- [**AI & Algoritmes Kwalificatie Tool (AI AQT)**](https://algorithmaudit.eu/nl/technical-tools/implementation-tool/) (Algorithm Audit) — classificeert algoritmische systemen tegen AI-verordening, AVG en kaders voor algoritmegovernance, inclusief identificatie, rol/status, risicocategorie en bijbehorende verplichtingen.

| | **AI-Verordening Beslishulp** (MinBZK) | **AI AQT** (Algorithm Audit) | **findocs** (MinFin) |
|---|---|---|---|
| Type | Beslishulp / kwalificatie | Beslishulp / kwalificatie | Invultool voor assessments |
| Doel | Bepalen of de AI-verordening van toepassing is | Identificeren en risico-classificeren van algoritmes (AI-verordening, AVG) | Invullen van AIIA, DPIA en meer |
| Werkwijze | Vragenboom (decision tree) | Dynamische vragenlijsten + venndiagram-output | Gestructureerde formulieren met AI-suggesties |
| Uitkomst | Risicoclassificatie + verplichtingenoverzicht | Classificatie + verplichtingen per rol/status/risico | Ingevuld assessment (PDF-export) |
| AI-ondersteuning | Geen (regelgebaseerd) | Geen (regelgebaseerd) | LLM voor tekstverbetering en synthese |
| Installatie | Geen — embeddable of gehoste webpagina; lokaal via `npm run dev`/Docker | Geen — gehoste webpagina (open source) | Node.js + Python + Ollama vereist |
| Opslag | Sessie-gebaseerd, optionele PDF-export | Centrale opslag mogelijk voor expert-review | Automatisch in de browser (Pinia) |
| Licentie | EUPL-1.2 | EUPL-1.2 | EUPL-1.2 |

Een typische workflow zou zijn: gebruik eerst een **beslishulp** om vast te stellen welke assessments verplicht zijn, en gebruik daarna **findocs** (of par-dpia-form) om die assessments in te vullen.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite |
| Rich text editor | Tiptap |
| State management | Pinia (with persistence) |
| Design system | NL RVO Component Library |
| PDF export | pdfmake |
| Backend API | FastAPI (Python) |
| LLM inference | Ollama (local) |

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Python](https://www.python.org/) 3.13+
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Ollama](https://ollama.com/) running locally with a model pulled (default: `llama3.2`)

## Getting started

### 1. Pull the LLM model

```bash
ollama pull llama3.2
```

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
| `OLLAMA_MODEL` | `llama3.2` | Ollama model to use |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |

### 5. Start the backend

```bash
uv run uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.

### 6. Start the frontend

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

## Running with Docker

```bash
docker compose up
```

This starts the frontend (nginx, port 80) and backend (FastAPI, port 8000) in containers. Make sure Ollama is reachable from within Docker (configure `OLLAMA_BASE_URL` accordingly).

## API

| Endpoint | Method | Description |
|---|---|---|
| `/api/improve` | `POST` | Suggest an improved version of a text fragment |
| `/api/synthesize` | `POST` | Synthesize a DPIA answer from AIIA answers |

### `POST /api/improve`

**Request body:**

```json
{
  "text": "Te verbeteren tekst...",
  "question_context": "Naam van de vraag of sectie (optioneel)"
}
```

**Response:**

```json
{
  "suggestion": "Verbeterde versie van de tekst",
  "rationale": "Één zin toelichting op de verbetering"
}
```

### `POST /api/synthesize`

**Request body:**

```json
{
  "aiia_answers": { "q1": "antwoord..." },
  "aiia_questions": { "q1": "Vraag tekst..." },
  "dpia_question": "DPIA-vraag waarvoor een suggestie nodig is",
  "synthesis_hint": "Optionele extra context"
}
```

**Response:**

```json
{
  "suggestion": "Suggestie voor de DPIA",
  "rationale": "Één zin toelichting"
}
```

## Mogelijke toekomstige functionaliteit

### Samenwerken via Tiptap

De rich-text editor (Tiptap) biedt een solide basis voor real-time samenwerking. Met de Tiptap Collaboration-extensie (gebaseerd op Yjs/CRDT) kunnen meerdere gebruikers tegelijk aan hetzelfde formulier werken: wijzigingen worden direct zichtbaar, conflicten worden automatisch opgelost en er is geen handmatig samenvoegen nodig. Dit is met name waardevol voor grote assessments waarbij juridische, privacy- en technische experts elk hun eigen secties invullen.

### Automatisch invullen vanuit documenten

In plaats van formulieren helemaal handmatig in te vullen, zou de tool bestaande projectdocumenten (bijv. een projectplan, architectuurdocument of eerder ingevuld assessment) als invoer kunnen verwerken. Het LLM analyseert de documenten en genereert automatisch voorstellen voor alle relevante vragen. Dit verkort de doorlooptijd aanzienlijk voor projecten die al over uitgebreide documentatie beschikken.

### Bewaarfunctionaliteit in de app

Op dit moment wordt de voortgang opgeslagen in de lokale browsersessie (via Pinia persisted state). Een volwaardige bewaarfunctionaliteit zou het mogelijk maken om ingevulde formulieren op te slaan in een account of gedeelde omgeving, later verder te gaan op een ander apparaat, en meerdere versies of concepten naast elkaar te beheren. Dit vereist een backend-koppeling met gebruikersauthenticatie en een database.

## Source documents

| Document | Source |
|---|---|
| AI Impact Assessment (IenW, v2.0) | [rijksoverheid.nl](https://www.rijksoverheid.nl/documenten/rapporten/2022/11/30/ai-impact-assessment-ministerie-van-infrastructuur-en-waterstaat) |
| Model DPIA Rijksdienst (v3.0) | [kcbr.nl](https://www.kcbr.nl/sites/default/files/2023-09/Model%20DPIA%20Rijksdienst%20v3.0.pdf) |

## License

Licensed under the [European Union Public Licence v1.2 (EUPL-1.2)](LICENSE).
