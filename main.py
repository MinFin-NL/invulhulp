"""
AIIA PoC – FastAPI backend

Run:
    uvicorn main:app --reload

Environment variables (can be set via .env file):
    # Local (Ollama) — used when AZURE_OPENAI_ENDPOINT is not set
    OLLAMA_MODEL      — model name (default: llama3.2)
    OLLAMA_BASE_URL   — Ollama server URL (default: http://localhost:11434)

    # Azure OpenAI — used when AZURE_OPENAI_ENDPOINT is set
    AZURE_OPENAI_ENDPOINT        — e.g. https://oai-foundation-inno-d.openai.azure.com/
    AZURE_OPENAI_API_KEY         — API key
    AZURE_OPENAI_DEPLOYMENT      — deployment name (default: gpt-5.3-chat)
    AZURE_OPENAI_API_VERSION     — API version (default: 2025-04-01-preview)

    # Shared
    CORS_ORIGINS      — comma-separated allowed origins (default: http://localhost:5173)
"""

import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")]

AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
USE_AZURE = bool(AZURE_OPENAI_ENDPOINT)

if USE_AZURE:
    from openai import AzureOpenAI

    _azure_client = AzureOpenAI(
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=os.environ.get("AZURE_OPENAI_API_KEY", ""),
        api_version=os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
    )
    AZURE_DEPLOYMENT = os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-5.3-chat")
else:
    import ollama

    OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    _ollama_client = ollama.Client(host=OLLAMA_BASE_URL)


def chat(system: str, user: str) -> str:
    """Send a chat message and return the raw response content."""
    if USE_AZURE:
        # o-series reasoning models (o1, o3, o4) require "developer" role instead of "system"
        is_reasoning_model = AZURE_DEPLOYMENT.startswith(("o1", "o3", "o4"))
        system_role = "developer" if is_reasoning_model else "system"
        response = _azure_client.chat.completions.create(
            model=AZURE_DEPLOYMENT,
            messages=[
                {"role": system_role, "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content or ""
    else:
        response = _ollama_client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.message.content


app = FastAPI(title="AIIA PoC API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "Je bent een assistent die helpt bij het invullen van AI Impact Assessments "
    "voor de Nederlandse overheid (Ministerie van Financiën - MinFin).\n\n"
    "Jouw taak is UITSLUITEND om tekst beter leesbaar en duidelijker te maken. "
    "Je mag NOOIT nieuwe feiten, claims of informatie toevoegen die de gebruiker "
    "niet zelf heeft geschreven. Bewaar altijd de stem, toon en intentie van de "
    "gebruiker. Verbeter alleen grammatica, zinsstructuur en formulering.\n\n"
    "Schrijf in dezelfde taal als de invoer (bijna altijd Nederlands).\n"
    "Houd de lengte vergelijkbaar met het origineel.\n\n"
    "Reageer uitsluitend in dit XML-formaat:\n"
    "<verbeterd>jouw verbeterde versie hier</verbeterd>\n"
    "<toelichting>één zin over wat je hebt verbeterd</toelichting>"
)

SYNTHESIZE_SYSTEM_PROMPT = (
    "Je bent een specialist in gegevensbescherming die DPIA's (Data Protection Impact Assessments) "
    "opstelt voor de Nederlandse overheid (Ministerie van Financiën - MinFin).\n\n"
    "Je krijgt antwoorden uit een AIIA (AI Impact Assessment) en een specifieke DPIA-vraag. "
    "Jouw taak is om een volledig nieuw DPIA-antwoord te schrijven dat:\n"
    "1. Uitsluitend gebaseerd is op de feiten uit de AIIA-antwoorden (voeg geen nieuwe feiten toe)\n"
    "2. De DPIA-vraag direct en volledig beantwoordt vanuit het perspectief van gegevensbescherming\n"
    "3. AVG-terminologie gebruikt waar relevant (verwerkingsdoeleinden, rechtsgrond, betrokkenen, "
    "   verwerkingsverantwoordelijke, gegevensminimalisatie, etc.)\n"
    "4. Inhoudelijk anders geformuleerd is dan de AIIA-brontekst — dit is een DPIA, geen AI-assessment\n\n"
    "Schrijf in het Nederlands. Het antwoord mag korter of langer zijn dan de brontekst als dat passend is.\n\n"
    "Reageer uitsluitend in dit XML-formaat:\n"
    "<suggestie>jouw DPIA-antwoord hier</suggestie>\n"
    "<toelichting>één zin over welke AIIA-informatie je hebt vertaald naar DPIA-context</toelichting>"
)


class ImproveRequest(BaseModel):
    text: str
    question_context: str = ""


class ImproveResponse(BaseModel):
    suggestion: str
    rationale: str


class SynthesizeRequest(BaseModel):
    aiia_answers: dict[str, str]
    aiia_questions: dict[str, str]
    dpia_question: str
    synthesis_hint: str = ""


@app.post("/api/improve", response_model=ImproveResponse)
async def improve_text(req: ImproveRequest) -> ImproveResponse:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tekst mag niet leeg zijn.")
    if len(text) > 8000:
        raise HTTPException(status_code=400, detail="Tekst is te lang (max 8000 tekens).")

    user_message = (
        f"Vraag in het formulier: {req.question_context}\n\n"
        f"Te verbeteren tekst:\n{text}"
    )

    try:
        raw = chat(SYSTEM_PROMPT, user_message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM fout: {e}") from e

    m_suggestion = re.search(r"<verbeterd>(.*?)</verbeterd>", raw, re.DOTALL | re.IGNORECASE)
    m_rationale = re.search(r"<toelichting>(.*?)</toelichting>", raw, re.DOTALL | re.IGNORECASE)

    suggestion = m_suggestion.group(1).strip() if m_suggestion else text
    rationale = m_rationale.group(1).strip() if m_rationale else ""

    return ImproveResponse(suggestion=suggestion, rationale=rationale)


@app.post("/api/synthesize", response_model=ImproveResponse)
async def synthesize_from_aiia(req: SynthesizeRequest) -> ImproveResponse:
    if not req.aiia_answers:
        raise HTTPException(status_code=400, detail="Geen AIIA-antwoorden opgegeven.")

    context_parts = []
    for qid, answer in req.aiia_answers.items():
        q_text = req.aiia_questions.get(qid, qid)
        context_parts.append(f"AIIA-vraag: {q_text}\nAntwoord: {answer}")

    hint = f"\nExtra context: {req.synthesis_hint}" if req.synthesis_hint else ""
    user_message = (
        f"DPIA-vraag waarvoor een suggestie nodig is:\n{req.dpia_question}\n\n"
        f"Beschikbare AIIA-informatie:{hint}\n\n" + "\n\n".join(context_parts)
    )

    try:
        raw = chat(SYNTHESIZE_SYSTEM_PROMPT, user_message)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM fout: {e}") from e

    m_suggestion = re.search(r"<suggestie>(.*?)</suggestie>", raw, re.DOTALL | re.IGNORECASE)
    m_rationale = re.search(r"<toelichting>(.*?)</toelichting>", raw, re.DOTALL | re.IGNORECASE)

    suggestion = m_suggestion.group(1).strip() if m_suggestion else ""
    rationale = m_rationale.group(1).strip() if m_rationale else ""

    if not suggestion:
        raise HTTPException(status_code=500, detail="Kon geen suggestie genereren.")

    return ImproveResponse(suggestion=suggestion, rationale=rationale)
