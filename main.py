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

import asyncio
import json
import os
import re
from collections.abc import AsyncGenerator

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")]

AZURE_OPENAI_ENDPOINT = os.environ.get("AZURE_OPENAI_ENDPOINT", "")
USE_AZURE = bool(AZURE_OPENAI_ENDPOINT)

if USE_AZURE:
    from openai import AsyncAzureOpenAI

    _azure_client = AsyncAzureOpenAI(
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


async def chat(system: str, user: str) -> str:
    """Send a chat message and return the full response content."""
    if USE_AZURE:
        is_reasoning_model = AZURE_DEPLOYMENT.startswith(("o1", "o3", "o4"))
        system_role = "developer" if is_reasoning_model else "system"
        response = await _azure_client.chat.completions.create(
            model=AZURE_DEPLOYMENT,
            messages=[
                {"role": system_role, "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.choices[0].message.content or ""
    else:
        response = await asyncio.to_thread(
            _ollama_client.chat,
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        return response.message.content


async def stream_chat(system: str, user: str) -> AsyncGenerator[str, None]:
    """Yield raw text chunks from the LLM as they arrive."""
    if USE_AZURE:
        is_reasoning_model = AZURE_DEPLOYMENT.startswith(("o1", "o3", "o4"))
        system_role = "developer" if is_reasoning_model else "system"
        # o-series reasoning models do not support streaming
        if is_reasoning_model:
            full = await _azure_client.chat.completions.create(
                model=AZURE_DEPLOYMENT,
                messages=[
                    {"role": system_role, "content": system},
                    {"role": "user", "content": user},
                ],
            )
            yield full.choices[0].message.content or ""
            return
        stream = await _azure_client.chat.completions.create(
            model=AZURE_DEPLOYMENT,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    else:
        response = await asyncio.to_thread(
            _ollama_client.chat,
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        )
        yield response.message.content


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
    "Je bent een assistent die helpt bij het invullen van projectmanagement- en compliance-documenten "
    "voor de Nederlandse overheid (Ministerie van Financiën - MinFin).\n\n"
    "Je krijgt antwoorden uit een bronformulier en een specifieke doelvraag. "
    "Jouw taak is om een volledig nieuw antwoord te schrijven dat:\n"
    "1. Uitsluitend gebaseerd is op de feiten uit de bronantwoorden (voeg geen nieuwe feiten toe)\n"
    "2. De doelvraag direct en volledig beantwoordt in de context van dat document\n"
    "3. De juiste terminologie gebruikt die past bij het doeldocument\n"
    "4. Inhoudelijk anders geformuleerd is dan de brontekst — het gaat om een ander document met een andere focus\n\n"
    "Schrijf in het Nederlands. Het antwoord mag korter of langer zijn dan de brontekst als dat passend is.\n\n"
    "Reageer uitsluitend in dit XML-formaat:\n"
    "<suggestie>jouw antwoord hier</suggestie>\n"
    "<toelichting>één zin over welke broninformatie je hebt vertaald naar de doelcontext</toelichting>"
)


class ImproveRequest(BaseModel):
    text: str
    question_context: str = ""


class ImproveResponse(BaseModel):
    suggestion: str
    rationale: str


class SynthesizeRequest(BaseModel):
    source_answers: dict[str, str]
    source_questions: dict[str, str]
    target_question: str
    synthesis_hint: str = ""


def _improve_user_message(req: ImproveRequest) -> str:
    return (
        f"Vraag in het formulier: {req.question_context}\n\n"
        f"Te verbeteren tekst:\n{req.text.strip()}"
    )


def _synthesize_user_message(req: SynthesizeRequest) -> str:
    context_parts = []
    for qid, answer in req.source_answers.items():
        q_text = req.source_questions.get(qid, qid)
        context_parts.append(f"Bronvraag: {q_text}\nAntwoord: {answer}")
    hint = f"\nExtra context: {req.synthesis_hint}" if req.synthesis_hint else ""
    return (
        f"Doelvraag waarvoor een suggestie nodig is:\n{req.target_question}\n\n"
        f"Beschikbare broninformatie:{hint}\n\n" + "\n\n".join(context_parts)
    )


def _parse_improve(raw: str, fallback: str) -> tuple[str, str]:
    m_s = re.search(r"<verbeterd>(.*?)</verbeterd>", raw, re.DOTALL | re.IGNORECASE)
    m_r = re.search(r"<toelichting>(.*?)</toelichting>", raw, re.DOTALL | re.IGNORECASE)
    return (m_s.group(1).strip() if m_s else fallback), (m_r.group(1).strip() if m_r else "")


def _parse_synthesize(raw: str) -> tuple[str, str]:
    m_s = re.search(r"<suggestie>(.*?)</suggestie>", raw, re.DOTALL | re.IGNORECASE)
    m_r = re.search(r"<toelichting>(.*?)</toelichting>", raw, re.DOTALL | re.IGNORECASE)
    return (m_s.group(1).strip() if m_s else ""), (m_r.group(1).strip() if m_r else "")


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


async def _sse_stream(
    system_prompt: str,
    user_message: str,
    parse_fn,
) -> AsyncGenerator[str, None]:
    raw = ""
    try:
        async for chunk in stream_chat(system_prompt, user_message):
            raw += chunk
            yield f"event: chunk\ndata: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        suggestion, rationale = parse_fn(raw)
        yield f"event: done\ndata: {json.dumps({'suggestion': suggestion, 'rationale': rationale}, ensure_ascii=False)}\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'detail': str(e)}, ensure_ascii=False)}\n\n"


@app.post("/api/improve", response_model=ImproveResponse)
async def improve_text(req: ImproveRequest) -> ImproveResponse:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tekst mag niet leeg zijn.")
    if len(text) > 8000:
        raise HTTPException(status_code=400, detail="Tekst is te lang (max 8000 tekens).")
    try:
        raw = await chat(SYSTEM_PROMPT, _improve_user_message(req))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM fout: {e}") from e
    suggestion, rationale = _parse_improve(raw, text)
    return ImproveResponse(suggestion=suggestion, rationale=rationale)


@app.post("/api/improve/stream")
async def improve_text_stream(req: ImproveRequest) -> StreamingResponse:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tekst mag niet leeg zijn.")
    if len(text) > 8000:
        raise HTTPException(status_code=400, detail="Tekst is te lang (max 8000 tekens).")
    return StreamingResponse(
        _sse_stream(SYSTEM_PROMPT, _improve_user_message(req), lambda raw: _parse_improve(raw, text)),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.post("/api/synthesize", response_model=ImproveResponse)
async def synthesize_from_source(req: SynthesizeRequest) -> ImproveResponse:
    if not req.source_answers:
        raise HTTPException(status_code=400, detail="Geen bronantwoorden opgegeven.")
    try:
        raw = await chat(SYNTHESIZE_SYSTEM_PROMPT, _synthesize_user_message(req))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM fout: {e}") from e
    suggestion, rationale = _parse_synthesize(raw)
    if not suggestion:
        raise HTTPException(status_code=500, detail="Kon geen suggestie genereren.")
    return ImproveResponse(suggestion=suggestion, rationale=rationale)


@app.post("/api/synthesize/stream")
async def synthesize_stream(req: SynthesizeRequest) -> StreamingResponse:
    if not req.source_answers:
        raise HTTPException(status_code=400, detail="Geen bronantwoorden opgegeven.")
    return StreamingResponse(
        _sse_stream(SYNTHESIZE_SYSTEM_PROMPT, _synthesize_user_message(req), _parse_synthesize),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
