"""
AIIA PoC – FastAPI backend

Run:
    uvicorn main:app --reload

Environment variables (can be set via .env file):
    CORS_ORIGINS      — comma-separated allowed origins (default: http://localhost:5173)

    LLM/embedding backend selection and configuration: see llm.py.
    Vector store configuration: see rag.py.
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

import llm
import rag

load_dotenv()

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")]

backend = llm.create_backend()


async def _warmup() -> None:
    """Preload the model / warm the connection pool so the first real
    request doesn't pay a cold-start penalty (TLS handshake for Azure,
    model load into VRAM for Ollama)."""
    try:
        await backend.chat("", "ping")
    except Exception as e:
        print(f"[warmup] chat warmup skipped: {e}")
    try:
        await backend.embed(["ping"])
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
    "Jouw taak is UITSLUITEND om tekst beter leesbaar en duidelijker te maken.\n\n"
    "Harde regels:\n"
    "1. Voeg NOOIT nieuwe feiten, namen, aantallen of claims toe die niet in de "
    "invoer staan, laat geen feiten weg en verander de betekenis niet (wat nu "
    "gebeurt blijft nu, wat gepland is blijft gepland).\n"
    "2. Herschrijf naar correcte, formele ambtelijke stijl: verwijder spreektaal "
    "en vulwoorden ('ofzo', 'best wel', 'gewoon') en herstel grammatica en "
    "zinsbouw. Twijfel je over een formulering, kies dan de eenvoudigste "
    "correcte zin.\n"
    "3. Bewaar de intentie en inhoud van de gebruiker; het is hun tekst, niet "
    "de jouwe.\n"
    "4. Schrijf in dezelfde taal als de invoer (bijna altijd Nederlands) en "
    "houd de lengte vergelijkbaar met het origineel.\n"
    "5. Begin direct met de verbeterde tekst zelf — neem de formuliervraag, "
    "een kop of een label NIET op in je antwoord.\n\n"
    "Reageer uitsluitend in dit XML-formaat:\n"
    "<verbeterd>jouw verbeterde versie hier</verbeterd>\n"
    "<toelichting>één zin over wat je hebt verbeterd</toelichting>\n\n"
    "Twee uitzonderingen op dit formaat:\n"
    "- Is de invoer zó onduidelijk of dubbelzinnig dat je hem niet kunt "
    "verbeteren zonder een aanname te doen over de betekenis? Stel dan in "
    "plaats van bovenstaand formaat precies één korte vraag aan de gebruiker:\n"
    "<verduidelijking>jouw vraag hier</verduidelijking>\n"
    "- Beschrijft de tekst een proces, gegevensstroom of architectuur met "
    "meerdere stappen of onderdelen? Voeg dan NA de toelichting-tag een "
    "mermaid-diagram toe dat die stappen visualiseert (gebruik uitsluitend "
    "feiten uit de tekst):\n"
    "<mermaid>flowchart TD\n  A[Eerste stap] --> B[Volgende stap]</mermaid>"
)

# The extraction system prompt is composed at request time from a short base
# plus exactly ONE field-specific block. Smaller models (e.g. Mistral 7B) follow
# a focused, relevant-only instruction set far more reliably than one long wall
# of rules, so we never send blocks that don't apply to the current field.

_EXTRACT_BASE = (
    "Je helpt ambtenaren van het Ministerie van Financiën een formulier in te "
    "vullen. Je krijgt één doelvraag en een set fragmenten uit brondocumenten "
    "(notulen, brainstorms, agenda's). Beantwoord de doelvraag UITSLUITEND met "
    "feiten die letterlijk in de fragmenten staan.\n\n"
    "Harde regels:\n"
    "1. Verzin niets en vul niets aan met algemene kennis.\n"
    "2. Staat het antwoord niet letterlijk in de fragmenten? Antwoord dan exact "
    "en uitsluitend: 'Onvoldoende informatie in de brondocumenten.' Schrijf "
    "GEEN eigen variant zoals 'dit wordt niet genoemd in de documenten' en "
    "gebruik NOOIT placeholders zoals 'X', '[invullen]' of '…'.\n"
    "3. Geef NOOIT een verwante maar andere waarde als de gevraagde waarde "
    "ontbreekt (vraagt het veld om een leverancier en noemen de fragmenten er "
    "geen, geef dan NIET een andere organisatie die toevallig wél genoemd "
    "wordt). Ook dan geldt: 'Onvoldoende informatie in de brondocumenten.'\n"
    "4. Begin NOOIT met de vraag, een label of een herhaling van de vraag — geef "
    "direct het antwoord.\n"
    "5. Neem GEEN document-labels of koppen over ('Eerste gedachten:', "
    "'Actiepunt:', 'Toelichting:'); parafraseer alleen de inhoud eronder.\n"
    "6. Zet bronverwijzingen en uitleg ALLEEN in <toelichting>, nooit in <suggestie>.\n\n"
)

_EXTRACT_FORMAT_BLOCKS = {
    "email": (
        "Dit veld vraagt om een E-MAILADRES. Geef uitsluitend één e-mailadres in "
        "de vorm naam@domein.nl, zonder label of extra tekst.\n"
        "  Fout: 'E-mailadres: anouk.dewit@belastingdienst.nl'   Fout: 'Anouk de Wit'\n"
        "  Goed: 'anouk.dewit@belastingdienst.nl'\n"
        "Staat er geen geldig e-mailadres in de fragmenten? Antwoord dan "
        "'Onvoldoende informatie in de brondocumenten.' — geef NOOIT een naam of "
        "iets anders als vervanging.\n\n"
    ),
    "phone": (
        "Dit veld vraagt om een TELEFOONNUMMER. Geef uitsluitend één geldig "
        "telefoonnummer (cijfers, eventueel met spaties of een +), zonder label.\n"
        "  Fout: 'Telefoonnummer: Anouk de Wit'   Goed: '06-12345678'\n"
        "Staat er geen telefoonnummer in de fragmenten? Antwoord dan "
        "'Onvoldoende informatie in de brondocumenten.'\n\n"
    ),
    "shorttext": (
        "Dit is een KORT feitelijk veld (bijv. naam, afdeling, datum). Geef "
        "uitsluitend de gevraagde waarde, zonder label en zonder extra zin.\n"
        "  Fout: 'Naam opdrachtgever: Belastingdienst'   Goed: 'Belastingdienst'\n"
        "Let op: de waarde moet precies datgene zijn waar het veld om vraagt. "
        "Controleer vóór je antwoordt: staat er in de fragmenten een waarde "
        "die EXPLICIET deze rol of dit kenmerk heeft? Voorbeeld: vraagt het "
        "veld om de 'externe leverancier' en noemen de fragmenten alleen een "
        "opdrachtgever of afdeling, dan is het antwoord 'Onvoldoende "
        "informatie in de brondocumenten.' — vul NOOIT een naam of organisatie "
        "in die wel genoemd wordt maar een andere rol heeft.\n\n"
    ),
    "date": (
        "Dit veld vraagt om een DATUM. Geef uitsluitend de datum zoals die in de "
        "fragmenten staat, zonder label of extra tekst.\n\n"
    ),
    "longtext": (
        "Schrijf een samenhangend antwoord van één of meer alinea's in formele, "
        "ambtelijke stijl en in de derde persoon. Wees volledig én concreet: "
        "neem ALLE feiten, maatregelen en aantallen uit de fragmenten op die de "
        "vraag beantwoorden — sla er geen over. Noemen de fragmenten "
        "bijvoorbeeld drie maatregelen, beschrijf dan alle drie. Gebruik de "
        "namen, systemen, bedragen, percentages en data uit de fragmenten. "
        "Herhaal niets en voeg geen samenvattende slotzin toe.\n\n"
    ),
    "choice": (
        "Dit is een MEERKEUZEVRAAG. Werk zo:\n"
        "1. Zoek de relevante feiten in de fragmenten.\n"
        "2. Kies de optie(s) uit de lijst waarvan de betekenis bij die feiten "
        "past — óók als de fragmenten andere woorden gebruiken. Voorbeeld: "
        "noemen de fragmenten 'naam en adres' en is er een optie 'NAW-gegevens', "
        "kies dan 'NAW-gegevens'.\n"
        "3. Mogen er meerdere opties gekozen worden? Loop dan ELKE optie uit de "
        "lijst langs en kies álle opties die door de fragmenten worden "
        "ondersteund, niet alleen de eerste die past.\n"
        "4. Geef de gekozen optie(s) WOORDELIJK terug — exact dezelfde tekst, "
        "spelling en hoofdletters als in de lijst. Meerdere opties scheid je "
        "met '; '.\n"
        "Neem NOOIT woorden uit de fragmenten over die niet in de optielijst "
        "staan en verzin geen nieuwe opties. Past geen enkele optie op basis "
        "van de fragmenten, antwoord dan 'Onvoldoende informatie in de "
        "brondocumenten.'\n\n"
    ),
}

_EXTRACT_OUTPUT = (
    "Reageer uitsluitend in dit XML-formaat (geen markdown, geen tekst buiten de tags):\n"
    "<suggestie>jouw antwoord hier</suggestie>\n"
    "<toelichting>één zin: welk(e) fragment(en) je gebruikte</toelichting>"
)


def _resolve_format(question_type: str, field_format: str) -> str:
    """Pick which field-specific block applies to the current field."""
    if question_type in ("radio", "checkbox"):
        return "choice"
    if field_format in _EXTRACT_FORMAT_BLOCKS:
        return field_format
    return "longtext"


def _build_extract_system_prompt(
    question_type: str, field_format: str, form_context: str
) -> str:
    context = f"Context van dit formulier: {form_context.strip()}\n\n" if form_context.strip() else ""
    block = _EXTRACT_FORMAT_BLOCKS[_resolve_format(question_type, field_format)]
    return context + _EXTRACT_BASE + block + _EXTRACT_OUTPUT

SYNTHESIZE_SYSTEM_PROMPT = (
    "Je bent een assistent die helpt bij het invullen van projectmanagement- en compliance-documenten "
    "voor de Nederlandse overheid (Ministerie van Financiën - MinFin).\n\n"
    "Je krijgt antwoorden uit een bronformulier en een specifieke doelvraag. "
    "Jouw taak is om een volledig nieuw antwoord te schrijven dat:\n"
    "1. Uitsluitend gebaseerd is op de feiten uit de bronantwoorden (voeg geen nieuwe feiten toe)\n"
    "2. De doelvraag direct en volledig beantwoordt in de context van dat document\n"
    "3. Alle concrete feiten uit de bronantwoorden behoudt die relevant zijn voor "
    "de doelvraag: namen, aantallen, soorten gegevens (zoals BSN of medische "
    "gegevens), percentages en data. Vat deze niet weg in algemene bewoordingen\n"
    "4. De juiste terminologie gebruikt die past bij het doeldocument\n"
    "5. Inhoudelijk anders geformuleerd is dan de brontekst — het gaat om een ander document met een andere focus\n\n"
    "Schrijf in het Nederlands. Het antwoord mag korter of langer zijn dan de "
    "brontekst als dat passend is. Neem labels zoals 'Bronvraag:' of "
    "'Antwoord:' nooit over in je antwoord.\n\n"
    "Controleer vóór je afsluit: staan alle namen, aantallen, soorten gegevens "
    "en percentages uit de bronantwoorden die relevant zijn voor de doelvraag "
    "ook echt in je antwoord? Zo nee, vul ze aan.\n\n"
    "Reageer uitsluitend in dit XML-formaat:\n"
    "<suggestie>jouw antwoord hier</suggestie>\n"
    "<toelichting>één zin over welke broninformatie je hebt vertaald naar de doelcontext</toelichting>"
)


class ImproveRequest(BaseModel):
    text: str
    question_context: str = ""
    # Follow-up round after the model asked a <verduidelijking> question.
    clarification_question: str = ""
    clarification_answer: str = ""


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
    field_format: str = ""
    form_context: str = ""


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
    guidance: str = ""
    options: list[str] = []
    question_type: str = "text"
    field_format: str = ""
    form_context: str = ""
    doc_ids: list[str] = []
    top_k: int = 6


def _improve_user_message(req: ImproveRequest) -> str:
    msg = (
        f"Vraag in het formulier: {req.question_context}\n\n"
        f"Te verbeteren tekst:\n{req.text.strip()}"
    )
    if req.clarification_question.strip() and req.clarification_answer.strip():
        msg += (
            f"\n\nJe stelde eerder deze verduidelijkingsvraag: {req.clarification_question.strip()}\n"
            f"Antwoord van de gebruiker: {req.clarification_answer.strip()}\n"
            "Verwerk dit antwoord en geef nu de verbeterde tekst. "
            "Stel geen nieuwe verduidelijkingsvraag."
        )
    return msg


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


_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s().-]{6,}\d)")
# Leading "Label:" / "Label -" prefix that weak models tend to echo back.
_LABEL_PREFIX_RE = re.compile(r"^\s*[\wÀ-ÿ /()&'\".-]{1,60}?\s*[:–-]\s+")
# A source-reference line that belongs in <toelichting>, not in the answer.
_BRON_LINE_RE = re.compile(r"^\s*(bron|fragment\b|=== fragment).*$", re.IGNORECASE)
# Literal placeholders the model sometimes copies straight from the XML template.
_PLACEHOLDERS = {
    "jouw antwoord hier",
    "jouw verbeterde versie hier",
    "antwoord hier",
    "[invullen]",
}
# Paraphrased refusals ("dit wordt niet in de brondocumenten genoemd") that the
# model writes instead of the exact 'Onvoldoende informatie...' sentence. Only
# applied to short answers — a real longtext answer can mention these words too.
_NO_INFO_PARAPHRASE_RE = re.compile(
    r"\b(?:niet|geen|nergens)\b[^.\n]{0,80}\b(?:brondocument\w*|fragment\w*|bronnen|documenten)"
    r"|\b(?:wordt|worden|is|zijn|staat|staan)\s+(?:niet|nergens)\s+"
    r"(?:genoemd|vermeld|beschreven|gespecificeerd|bekend|beschikbaar)",
    re.IGNORECASE,
)


def _digits(s: str) -> str:
    return re.sub(r"\D", "", s)


def _grounded(value: str, source_text: str) -> bool:
    """True if the value verifiably appears in the retrieved source text. Used
    only for short factual fields, where a value that isn't literally present is
    almost certainly hallucinated (e.g. a stereotyped dummy phone number)."""
    if not source_text:
        return True  # nothing to check against — don't over-reject
    return value.lower() in source_text.lower()


def _validate_suggestion(
    suggestion: str,
    field_format: str,
    question_text: str,
    options: list[str],
    source_text: str = "",
) -> str:
    """Deterministic safety net: strip leaked labels/template text and reject
    values that don't match the field's expected shape or aren't grounded in the
    source. Returns "" to blank the field, which the frontend maps to "leave
    empty" — far safer than a confidently wrong value."""
    text = suggestion.strip()
    if not text or "onvoldoende informatie" in text.lower():
        return ""
    if text.lower().strip(".") in _PLACEHOLDERS:
        return ""
    if len(text) < 250 and _NO_INFO_PARAPHRASE_RE.search(text):
        return ""

    # Multiple-choice answers must match an option verbatim; leave the wording
    # to mapSuggestionToAnswer on the client and don't strip here.
    if options:
        return text

    # Drop a leaked "Label:" prefix — but only for short factual fields: a
    # longtext answer may legitimately open with "Er zijn drie risico's: ...",
    # and chopping at the colon would destroy it.
    if field_format in ("email", "phone", "shorttext", "date"):
        stripped = _LABEL_PREFIX_RE.sub("", text, count=1).strip()
        if stripped:
            text = stripped
    # A verbatim echo of the question is never content, regardless of field.
    if question_text and text.lower().startswith(question_text.strip().lower()):
        text = text[len(question_text.strip()):].lstrip(" :–-").strip()

    if field_format == "email":
        m = _EMAIL_RE.search(text)
        value = m.group(0) if m else ""
        return value if value and _grounded(value, source_text) else ""
    if field_format == "phone":
        m = _PHONE_RE.search(text)
        value = m.group(0).strip() if m else ""
        if not value:
            return ""
        # Compare on digits only so "06-21458877" matches "06 21458877" etc.
        return value if (not source_text or _digits(value) in _digits(source_text)) else ""
    if field_format in ("shorttext", "date"):
        return text if _grounded(text, source_text) else ""

    # Descriptive (longtext) fields: drop any leaked source-reference lines.
    lines = [ln for ln in text.splitlines() if not _BRON_LINE_RE.match(ln)]
    return "\n".join(lines).strip() or ""


def _make_extract_parser(
    field_format: str, question_text: str, options: list[str], source_text: str = ""
):
    def parse(raw: str) -> tuple[str, str]:
        suggestion, rationale = _parse_synthesize(raw)
        return (
            _validate_suggestion(suggestion, field_format, question_text, options, source_text),
            rationale,
        )

    return parse


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}

_CLARIFICATION_RE = re.compile(r"<verduidelijking>(.*?)</verduidelijking>", re.DOTALL | re.IGNORECASE)
_MERMAID_RE = re.compile(r"<mermaid>(.*?)</mermaid>", re.DOTALL | re.IGNORECASE)


async def _sse_stream(
    system_prompt: str,
    user_message: str,
    parse_fn,
    *,
    allow_clarification: bool = False,
    allow_diagram: bool = False,
) -> AsyncGenerator[str, None]:
    raw = ""
    try:
        async for chunk in backend.stream(system_prompt, user_message):
            raw += chunk
            yield f"event: chunk\ndata: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        if allow_clarification:
            m = _CLARIFICATION_RE.search(raw)
            if m and m.group(1).strip():
                # The model needs more input; the client answers and re-requests.
                yield f"event: clarification\ndata: {json.dumps({'question': m.group(1).strip()}, ensure_ascii=False)}\n\n"
                return
        if allow_diagram:
            m = _MERMAID_RE.search(raw)
            if m and m.group(1).strip():
                yield f"event: diagram\ndata: {json.dumps({'mermaid': m.group(1).strip()}, ensure_ascii=False)}\n\n"
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
        raw = await backend.chat(SYSTEM_PROMPT, _improve_user_message(req))
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
        _sse_stream(
            SYSTEM_PROMPT,
            _improve_user_message(req),
            lambda raw: _parse_improve(raw, text),
            # Never re-ask after a clarification round, to avoid loops.
            allow_clarification=not req.clarification_answer.strip(),
            allow_diagram=True,
        ),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.post("/api/synthesize", response_model=ImproveResponse)
async def synthesize_from_source(req: SynthesizeRequest) -> ImproveResponse:
    if not req.source_answers:
        raise HTTPException(status_code=400, detail="Geen bronantwoorden opgegeven.")
    try:
        raw = await backend.chat(SYNTHESIZE_SYSTEM_PROMPT, _synthesize_user_message(req))
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
    system_prompt = _build_extract_system_prompt(req.question_type, req.field_format, req.form_context)
    source_text = "\n".join(doc.content for doc in req.documents)
    try:
        raw = await backend.chat(system_prompt, _extract_user_message(req))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM fout: {e}") from e
    suggestion, rationale = _parse_synthesize(raw)
    suggestion = _validate_suggestion(
        suggestion, req.field_format, req.target_question, req.options, source_text
    )
    if not suggestion:
        raise HTTPException(status_code=500, detail="Kon geen suggestie genereren.")
    return ImproveResponse(suggestion=suggestion, rationale=rationale)


@app.post("/api/extract/stream")
async def extract_from_documents_stream(req: ExtractRequest) -> StreamingResponse:
    if not req.documents:
        raise HTTPException(status_code=400, detail="Geen brondocumenten opgegeven.")
    if not req.target_question.strip():
        raise HTTPException(status_code=400, detail="Doelvraag mag niet leeg zijn.")
    system_prompt = _build_extract_system_prompt(req.question_type, req.field_format, req.form_context)
    source_text = "\n".join(doc.content for doc in req.documents)
    parse_fn = _make_extract_parser(req.field_format, req.target_question, req.options, source_text)
    return StreamingResponse(
        _sse_stream(system_prompt, _extract_user_message(req), parse_fn),
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
            embed_fn=backend.embed,
        )
        ontology_task = rag.extract_ontology(req.name, req.content, backend.chat)
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
    await rag.delete_document(doc_id)
    return {"deleted": doc_id}


class VerifyDocumentsRequest(BaseModel):
    session_id: str
    doc_ids: list[str]


@app.post("/api/documents/verify")
async def verify_documents(req: VerifyDocumentsRequest) -> dict:
    """Return which doc_ids are actually present in the vector store."""
    found = await rag.get_indexed_doc_ids(req.session_id, req.doc_ids)
    return {"found": found, "missing": [d for d in req.doc_ids if d not in found]}


@app.delete("/api/sessions/{session_id}")
async def remove_session(session_id: str) -> dict:
    await rag.delete_session(session_id)
    return {"deleted": session_id}


def _rag_user_message(
    target_question: str,
    guidance: str,
    options: list[str],
    question_type: str,
    chunks: list[dict],
) -> str:
    # Guidance is shown as an explicit instruction block so the model treats it
    # as a format directive, not as content to copy into the answer.
    if guidance.strip():
        question_block = (
            f"[SCHRIJFRICHTLIJN — neem deze tekst NIET op in je antwoord]\n"
            f"{guidance}\n\n"
            f"Doelvraag: {target_question}"
        )
    else:
        question_block = f"Doelvraag: {target_question}"

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
        f"{question_block}{options_block}\n\n"
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
            embed_fn=backend.embed,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Retrieval mislukt: {e}") from e

    user_msg = _rag_user_message(req.target_question, req.guidance, req.options, req.question_type, chunks)
    system_prompt = _build_extract_system_prompt(req.question_type, req.field_format, req.form_context)
    source_text = "\n".join(c["text"] for c in chunks)
    parse_fn = _make_extract_parser(req.field_format, req.target_question, req.options, source_text)
    return StreamingResponse(
        _sse_stream(system_prompt, user_msg, parse_fn),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
