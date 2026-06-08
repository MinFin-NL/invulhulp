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

    # Azure OpenAI embeddings — optional separate resource for embeddings.
    # If AZURE_OPENAI_EMBEDDING_ENDPOINT is unset, the chat endpoint/key/version above are reused.
    AZURE_OPENAI_EMBEDDING_ENDPOINT      — e.g. https://oai-embedding-inno-d.openai.azure.com/
    AZURE_OPENAI_EMBEDDING_API_KEY       — API key for the embedding resource
    AZURE_OPENAI_EMBEDDING_API_VERSION   — API version (falls back to AZURE_OPENAI_API_VERSION)
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT    — embedding deployment name (read by rag.py)

    # Shared
    CORS_ORIGINS      — comma-separated allowed origins (default: http://localhost:5173)
"""

import asyncio
import json
import os
import re
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import rag

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

    # Embeddings may live on a different Azure OpenAI resource with its own endpoint/key.
    # If AZURE_OPENAI_EMBEDDING_ENDPOINT is set, use a dedicated client; otherwise reuse the chat client.
    AZURE_EMBEDDING_ENDPOINT = os.environ.get("AZURE_OPENAI_EMBEDDING_ENDPOINT", "")
    if AZURE_EMBEDDING_ENDPOINT:
        _azure_embedding_client = AsyncAzureOpenAI(
            azure_endpoint=AZURE_EMBEDDING_ENDPOINT,
            api_key=os.environ.get("AZURE_OPENAI_EMBEDDING_API_KEY", ""),
            api_version=os.environ.get(
                "AZURE_OPENAI_EMBEDDING_API_VERSION",
                os.environ.get("AZURE_OPENAI_API_VERSION", "2025-04-01-preview"),
            ),
        )
    else:
        _azure_embedding_client = _azure_client
else:
    import ollama

    OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
    OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
    _ollama_client = ollama.AsyncClient(host=OLLAMA_BASE_URL)


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
        response = await _ollama_client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            keep_alive=-1,
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
        stream = await _ollama_client.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            stream=True,
            keep_alive=-1,
        )
        async for chunk in stream:
            content = chunk.get("message", {}).get("content")
            if content:
                yield content


async def _warmup() -> None:
    """Preload the model / warm the connection pool so the first real
    request doesn't pay a cold-start penalty (TLS handshake for Azure,
    model load into VRAM for Ollama)."""
    try:
        await chat("", "ping")
    except Exception as e:
        print(f"[warmup] chat warmup skipped: {e}")
    try:
        await rag.embed_texts(["ping"], **_embed_clients())
    except Exception as e:
        print(f"[warmup] embedding warmup skipped: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Run warmup in the background so startup isn't blocked.
    task = asyncio.create_task(_warmup())
    yield
    task.cancel()


app = FastAPI(title="AIIA PoC API", version="1.0.0", lifespan=lifespan)

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

EXTRACT_SYSTEM_PROMPT = (
    "Je bent een assistent die ambtenaren van het Ministerie van Financiën helpt "
    "bij het invullen van compliance- en projectdocumenten (zoals een AI Impact "
    "Assessment, DPIA of projectplan).\n\n"
    "Je krijgt een doelvraag uit een formulier en een set fragmenten die via "
    "semantische zoekopdracht uit de brondocumenten zijn gehaald (notulen, "
    "brainstorms, agenda's, projectplannen). Het zijn passages — niet de hele "
    "documenten. Jouw taak is om met die fragmenten een passend antwoord op de "
    "doelvraag te formuleren.\n\n"
    "Regels voor de inhoud:\n"
    "1. Baseer je antwoord UITSLUITEND op feiten die letterlijk in de fragmenten "
    "staan. Verzin niks, vul niets aan met algemene kennis.\n"
    "2. Wees concreet: gebruik specifieke namen, rollen, data, systemen, "
    "afdelingen en datasoorten zoals ze in de fragmenten genoemd worden. "
    "Vermijd vage formuleringen ('er is gesproken over...', 'er zijn risico's') "
    "als de fragmenten concretere informatie bevatten.\n"
    "3. Behoud kernbegrippen woordelijk (eigennamen, systeemnamen, juridische "
    "termen, bedragen, datums). Parafraseer omliggende zinnen wel om bij de "
    "toon van een formeel compliance-document te passen.\n"
    "4. Als meerdere fragmenten tegenstrijdig zijn, kies de meest recente of "
    "meest specifieke bron en vermeld dat kort in de toelichting.\n"
    "5. Als de fragmenten de vraag niet of slechts gedeeltelijk dekken, "
    "antwoord dan met: 'Onvoldoende informatie in de brondocumenten.' "
    "Doe dat alleen als er écht geen bruikbaar fragment is — niet als de "
    "informatie aanwezig maar onvolledig is (geef dan wat je wél hebt).\n"
    "6. Schrijf in helder Nederlands, in de derde persoon, passend bij de toon "
    "van een ambtelijk compliance-document.\n\n"
    "Bij meerkeuzevragen (er staat een lijst antwoordopties bij de vraag):\n"
    "- Kies precies één optie uit de lijst (of meerdere bij 'meerdere opties mogelijk') "
    "en geef die WOORDELIJK terug — exact dezelfde tekst, spelling en hoofdletters.\n"
    "- Wijk niet af van de gegeven opties.\n"
    "- Als geen enkele optie past op basis van de fragmenten, antwoord "
    "'Onvoldoende informatie in de brondocumenten.'\n\n"
    "Toelichting:\n"
    "- Noem in één zin welk(e) fragment(en) je hebt gebruikt (bv. 'fragment 1 uit "
    "notulen-2026-04-12.md').\n"
    "- Bij meerkeuze: geef in één zin de doorslaggevende reden voor je keuze.\n"
    "- Bij tegenstrijdige fragmenten: vermeld kort welke je gevolgd hebt en waarom.\n\n"
    "Reageer uitsluitend in dit XML-formaat (geen markdown, geen extra tekst):\n"
    "<suggestie>jouw antwoord hier</suggestie>\n"
    "<toelichting>één à twee zinnen volgens bovenstaande richtlijnen</toelichting>"
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


class ExtractDocument(BaseModel):
    name: str
    content: str


class ExtractRequest(BaseModel):
    documents: list[ExtractDocument]
    target_question: str
    options: list[str] = []
    question_type: str = "text"


class IndexDocumentRequest(BaseModel):
    session_id: str
    doc_id: str
    name: str
    content: str


class IndexDocumentResponse(BaseModel):
    doc_id: str
    chunk_count: int
    ontology: dict


class RagExtractRequest(BaseModel):
    session_id: str
    target_question: str
    options: list[str] = []
    question_type: str = "text"
    doc_ids: list[str] = []
    top_k: int = 6


def _embed_clients() -> dict:
    if USE_AZURE:
        return {"azure_client": _azure_embedding_client, "ollama_client": None}
    return {"azure_client": None, "ollama_client": _ollama_client}


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


def _extract_user_message(req: ExtractRequest) -> str:
    doc_parts = [
        f"=== Document: {doc.name} ===\n{doc.content.strip()}"
        for doc in req.documents
    ]
    options_block = ""
    if req.options:
        formatted = "\n".join(f"- {opt}" for opt in req.options)
        kind = "meerdere opties mogelijk" if req.question_type == "checkbox" else "kies precies één optie"
        options_block = (
            f"\n\nDit is een meerkeuzevraag ({kind}). Beschikbare antwoordopties (kies woordelijk):\n{formatted}"
        )
    return (
        f"Doelvraag waarvoor een antwoord nodig is:\n{req.target_question}"
        f"{options_block}\n\n"
        f"Brondocumenten:\n\n" + "\n\n".join(doc_parts)
    )


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


@app.post("/api/extract", response_model=ImproveResponse)
async def extract_from_documents(req: ExtractRequest) -> ImproveResponse:
    if not req.documents:
        raise HTTPException(status_code=400, detail="Geen brondocumenten opgegeven.")
    if not req.target_question.strip():
        raise HTTPException(status_code=400, detail="Doelvraag mag niet leeg zijn.")
    try:
        raw = await chat(EXTRACT_SYSTEM_PROMPT, _extract_user_message(req))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM fout: {e}") from e
    suggestion, rationale = _parse_synthesize(raw)
    if not suggestion:
        raise HTTPException(status_code=500, detail="Kon geen suggestie genereren.")
    return ImproveResponse(suggestion=suggestion, rationale=rationale)


@app.post("/api/extract/stream")
async def extract_from_documents_stream(req: ExtractRequest) -> StreamingResponse:
    if not req.documents:
        raise HTTPException(status_code=400, detail="Geen brondocumenten opgegeven.")
    if not req.target_question.strip():
        raise HTTPException(status_code=400, detail="Doelvraag mag niet leeg zijn.")
    return StreamingResponse(
        _sse_stream(EXTRACT_SYSTEM_PROMPT, _extract_user_message(req), _parse_synthesize),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---------------------------------------------------------------------------
# RAG endpoints
# ---------------------------------------------------------------------------


@app.post("/api/documents/index", response_model=IndexDocumentResponse)
async def index_document(req: IndexDocumentRequest) -> IndexDocumentResponse:
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="Document is leeg.")
    try:
        index_task = rag.index_document(
            session_id=req.session_id,
            doc_id=req.doc_id,
            doc_name=req.name,
            content=req.content,
            **_embed_clients(),
        )
        ontology_task = rag.extract_ontology(req.name, req.content, chat)
        index_result, ontology = await asyncio.gather(index_task, ontology_task)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Indexering mislukt: [{type(e).__name__}] {e}") from e
    return IndexDocumentResponse(
        doc_id=req.doc_id,
        chunk_count=index_result["chunk_count"],
        ontology=ontology,
    )


@app.delete("/api/documents/{doc_id}")
async def remove_document(doc_id: str) -> dict:
    rag.delete_document(doc_id)
    return {"deleted": doc_id}


@app.delete("/api/sessions/{session_id}")
async def remove_session(session_id: str) -> dict:
    rag.delete_session(session_id)
    return {"deleted": session_id}


def _rag_user_message(
    target_question: str,
    options: list[str],
    question_type: str,
    chunks: list[dict],
) -> str:
    options_block = ""
    if options:
        formatted = "\n".join(f"- {opt}" for opt in options)
        kind = "meerdere opties mogelijk" if question_type == "checkbox" else "kies precies één optie"
        options_block = (
            f"\n\nDit is een meerkeuzevraag ({kind}). Beschikbare antwoordopties (kies woordelijk):\n{formatted}"
        )

    if not chunks:
        excerpts_block = "(Geen relevante passages gevonden in de geïndexeerde documenten.)"
    else:
        excerpts_block = "\n\n".join(
            f"=== Fragment {i + 1} — {c['doc_name']} (deel {c['chunk_index']}) ===\n{c['text'].strip()}"
            for i, c in enumerate(chunks)
        )

    return (
        f"Doelvraag waarvoor een antwoord nodig is:\n{target_question}"
        f"{options_block}\n\n"
        f"Relevante passages uit de brondocumenten:\n\n{excerpts_block}"
    )


@app.post("/api/extract/rag/stream")
async def extract_rag_stream(req: RagExtractRequest) -> StreamingResponse:
    if not req.target_question.strip():
        raise HTTPException(status_code=400, detail="Doelvraag mag niet leeg zijn.")
    try:
        chunks = await rag.retrieve(
            session_id=req.session_id,
            query=req.target_question,
            top_k=req.top_k,
            doc_ids=req.doc_ids or None,
            **_embed_clients(),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Retrieval mislukt: {e}") from e

    user_msg = _rag_user_message(req.target_question, req.options, req.question_type, chunks)
    return StreamingResponse(
        _sse_stream(EXTRACT_SYSTEM_PROMPT, user_msg, _parse_synthesize),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
