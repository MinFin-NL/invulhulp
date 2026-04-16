"""
AIIA PoC – FastAPI backend (Ollama)

Run:
    uvicorn main:app --reload

Optionally set OLLAMA_MODEL in a .env file (default: llama3.2).
Ollama must be running locally on http://localhost:11434.
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

app = FastAPI(title="AIIA PoC API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
        response = ollama.chat(
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
