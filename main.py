"""
AIIA PoC – FastAPI backend (Ollama)

Run:
    uvicorn main:app --reload

Environment variables (can be set via .env file):
    OLLAMA_MODEL      — model name (default: llama3.2)
    OLLAMA_BASE_URL   — Ollama server URL (default: http://localhost:11434)
    CORS_ORIGINS      — comma-separated allowed origins (default: http://localhost:5173)
"""

import os
import re

import ollama
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")]

_ollama_client = ollama.Client(host=OLLAMA_BASE_URL)

app = FastAPI(title="AIIA PoC API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = (
    "Je bent een assistent die helpt bij het invullen van AI Impact Assessments "
    "voor de Nederlandse overheid (Ministerie van Infrastructuur en Waterstaat).\n\n"
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


SYNTHESIZE_SYSTEM_PROMPT = (
    "Je bent een assistent die helpt bij het invullen van een DPIA (Data Protection Impact Assessment) "
    "voor de Nederlandse overheid (Ministerie van Infrastructuur en Waterstaat).\n\n"
    "Je taak is om informatie uit een ingevulde AIIA (AI Impact Assessment) te gebruiken als basis "
    "voor een antwoord op een DPIA-vraag. Houd de feitelijke inhoud intact, maar herformuleer "
    "de tekst zodat deze past bij de context van een DPIA (gegevensbescherming, AVG, privacyrisico's).\n\n"
    "Voeg GEEN nieuwe feiten toe die niet in de AIIA-antwoorden staan. "
    "Schrijf in het Nederlands. Houd de lengte beknopt en passend bij het antwoord.\n\n"
    "Reageer uitsluitend in dit XML-formaat:\n"
    "<suggestie>jouw suggestie voor de DPIA hier</suggestie>\n"
    "<toelichting>één zin over hoe je de AIIA-informatie hebt aangepast voor de DPIA</toelichting>"
)


@app.post("/api/synthesize", response_model=ImproveResponse)
async def synthesize_from_aiia(req: SynthesizeRequest) -> ImproveResponse:
    if not req.aiia_answers:
        raise HTTPException(status_code=400, detail="Geen AIIA-antwoorden opgegeven.")

    context_parts = []
    for qid, answer in req.aiia_answers.items():
        q_text = req.aiia_questions.get(qid, qid)
        context_parts.append(f"AIIA-vraag: {q_text}\nAntwoord: {answer}")

    context = "\n\n".join(context_parts)
    hint = f"\nExtra context: {req.synthesis_hint}" if req.synthesis_hint else ""

    user_message = (
        f"DPIA-vraag waarvoor een suggestie nodig is:\n{req.dpia_question}\n\n"
        f"Beschikbare AIIA-informatie:{hint}\n\n{context}"
    )

    try:
        response = _ollama_client.chat(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYNTHESIZE_SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
    except ollama.ResponseError as e:
        raise HTTPException(status_code=502, detail=f"Ollama fout: {e.error}") from e

    raw = response.message.content

    suggestion = ""
    rationale = ""

    m_suggestion = re.search(r"<suggestie>(.*?)</suggestie>", raw, re.DOTALL | re.IGNORECASE)
    m_rationale = re.search(r"<toelichting>(.*?)</toelichting>", raw, re.DOTALL | re.IGNORECASE)

    if m_suggestion:
        suggestion = m_suggestion.group(1).strip()
    if m_rationale:
        rationale = m_rationale.group(1).strip()

    if not suggestion:
        raise HTTPException(status_code=500, detail="Kon geen suggestie genereren.")

    return ImproveResponse(suggestion=suggestion, rationale=rationale)


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
        response = _ollama_client.chat(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        )
    except ollama.ResponseError as e:
        raise HTTPException(status_code=502, detail=f"Ollama fout: {e.error}") from e

    raw = response.message.content

    suggestion = text  # safe fallback
    rationale = ""

    # Parse <verbeterd>...</verbeterd> and <toelichting>...</toelichting>
    m_suggestion = re.search(r"<verbeterd>(.*?)</verbeterd>", raw, re.DOTALL | re.IGNORECASE)
    m_rationale = re.search(r"<toelichting>(.*?)</toelichting>", raw, re.DOTALL | re.IGNORECASE)

    if m_suggestion:
        suggestion = m_suggestion.group(1).strip()
    if m_rationale:
        rationale = m_rationale.group(1).strip()

    # Never return an empty suggestion – fall back to the original text
    if not suggestion:
        suggestion = text

    return ImproveResponse(suggestion=suggestion, rationale=rationale)
