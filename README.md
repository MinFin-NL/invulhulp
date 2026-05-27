# findocs – AI-assisted Government Compliance Forms

A web application that helps Dutch government employees fill in AI-related compliance assessments. It guides users through structured forms and uses a locally running LLM to suggest text improvements and synthesize answers across forms.

Currently supported forms:

- **AIIA** – AI Impact Assessment (Ministerie van Financiën - MinFin, v2.0)
- **DPIA** – Data Protection Impact Assessment (Model DPIA Rijksdienst, v3.0)

The tool also supports **cross-form mapping**: relevant AIIA answers are used to pre-suggest answers for related DPIA questions, reducing duplicate work.

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

## Source documents

| Document | Source |
|---|---|
| AI Impact Assessment (IenW, v2.0) | [rijksoverheid.nl](https://www.rijksoverheid.nl/documenten/rapporten/2022/11/30/ai-impact-assessment-ministerie-van-infrastructuur-en-waterstaat) |
| Model DPIA Rijksdienst (v3.0) | [kcbr.nl](https://www.kcbr.nl/sites/default/files/2023-09/Model%20DPIA%20Rijksdienst%20v3.0.pdf) |

## License

Licensed under the [European Union Public Licence v1.2 (EUPL-1.2)](LICENSE).
