"""
AIIA PoC – FastAPI backend

Run (from the repo root, so ./data paths resolve there):
    uvicorn main:app --app-dir backend --reload
    python backend/main.py --dev   # auto-reload + bypass Keycloak login (local only)

Environment variables (can be set via .env file):
    CORS_ORIGINS      — comma-separated allowed origins (default: http://localhost:5173)

    LLM/embedding backend selection and configuration: see llm.py.
    Vector store configuration: see rag.py.
"""

import asyncio
import json
import logging
import os
import re
import sys
import unicodedata
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

# `--dev` turns off the Keycloak login for local work. Set before importing
# auth, whose DEV_AUTH_BYPASS constant is evaluated at import time. The flag is
# inherited by uvicorn's reloader subprocess via the environment.
if "--dev" in sys.argv:
    os.environ["DEV_AUTH_BYPASS"] = "true"

import admin_users
import auth
import collab
import docstore
import dossiers
import imagestore
import llm
import pdfextract
import rag
import users

log = logging.getLogger(__name__)

load_dotenv()

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")]
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-session-secret-change-me")
# HttpOnly session cookie only over HTTPS in production.
SESSION_HTTPS_ONLY = os.environ.get("SESSION_HTTPS_ONLY", "false").lower() == "true"

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
    # Start the collaboration WebSocket server (y-protocol sync per dossier).
    async with collab.ws_server:
        yield
        # Persist any in-flight collab state before the loop tears down.
        await collab.flush_all()
    task.cancel()


# Every route requires a logged-in session except /api/auth/* (handled inside
# require_user). The BFF flow lives in auth.py.
app = FastAPI(
    title="AIIA PoC API",
    version="1.0.0",
    lifespan=lifespan,
    dependencies=[Depends(auth.require_user)],
)

# SessionMiddleware backs request.session — both the OIDC flow state and the
# logged-in user identity live in this signed, HttpOnly cookie.
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    max_age=auth.SESSION_MAX_AGE,
    same_site="lax",
    https_only=SESSION_HTTPS_ONLY,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(auth.router)
app.include_router(admin_users.router)
app.include_router(dossiers.router)
app.include_router(users.router)
app.include_router(collab.router)

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
    "een kop of een label NIET op in je antwoord.\n"
    "6. Bevat de invoer Markdown-opmaak (**vet**, *cursief*, lijsten)? "
    "Herschrijf de tekst dan gewoon volgens bovenstaande regels en zet "
    "dezelfde opmaak op de overeenkomstige tekstdelen in je verbeterde "
    "versie. Voeg zelf GEEN nieuwe opmaak toe.\n\n"
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


def _table_format_block(columns: list["TableColumn"]) -> str:
    """Field block for table questions, built at request time because the
    column schema comes from the form JSON. Output contract: one pipe-separated
    row per line, optional whole-table note after a line that is exactly
    '---' — the same delimiter the client already uses for radio follow-ups."""
    col_lines = "\n".join(
        f"{i + 1}. {c.label}" + (f" — {c.hint}" if c.hint else "")
        for i, c in enumerate(columns)
    )
    example_header = " | ".join(c.label for c in columns[:2]) or "Naam | Rol"
    return (
        "Dit is een TABELVRAAG. Vul een tabel met exact deze kolommen, in deze "
        f"volgorde:\n{col_lines}\n"
        "Werk zo:\n"
        "- Geef per gevonden item precies één regel; scheid de celwaarden met ' | '.\n"
        "- Geef GEEN kopregel met kolomnamen, geen regel met streepjes en geen "
        "opsommingstekens.\n"
        "- Neem celwaarden letterlijk over uit de fragmenten. Staat een waarde "
        "voor een cel niet in de fragmenten, laat die cel dan leeg — verzin "
        "NOOIT een waarde. Gebruik het teken '|' nooit binnen een celwaarde.\n"
        "- Neem alleen rijen op die aantoonbaar uit de fragmenten komen.\n"
        "- Wil je een korte toelichting bij de hele tabel geven, zet dan na de "
        "laatste rij één regel met precies '---' en daarna de toelichting.\n"
        f"Voorbeeld met kolommen '{example_header}':\n"
        "Anouk de Wit | Projectleider\n"
        "Belastingdienst | Opdrachtgever\n"
        "---\n"
        "Beide rollen staan in de notulen van 12 maart.\n"
        "Staat er geen enkel passend item in de fragmenten? Antwoord dan "
        "uitsluitend 'Onvoldoende informatie in de brondocumenten.'\n\n"
    )


def _resolve_format(question_type: str, field_format: str) -> str:
    """Pick which field-specific block applies to the current field."""
    if question_type in ("radio", "checkbox"):
        return "choice"
    if field_format in _EXTRACT_FORMAT_BLOCKS:
        return field_format
    return "longtext"


def _build_extract_system_prompt(
    question_type: str,
    field_format: str,
    form_context: str,
    columns: list["TableColumn"] | None = None,
) -> str:
    context = f"Context van dit formulier: {form_context.strip()}\n\n" if form_context.strip() else ""
    if question_type == "table" and columns:
        block = _table_format_block(columns)
    else:
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


class SynthesizeRequest(BaseModel):
    source_answers: dict[str, str]
    source_questions: dict[str, str]
    target_question: str
    synthesis_hint: str = ""


class ExtractDocument(BaseModel):
    name: str
    content: str


class TableColumn(BaseModel):
    id: str
    label: str
    hint: str = ""


class ExtractRequest(BaseModel):
    documents: list[ExtractDocument]
    target_question: str
    options: list[str] = []
    question_type: str = "text"
    field_format: str = ""
    form_context: str = ""
    columns: list[TableColumn] = []  # table questions only
    related_questions: list[str] = []  # see _scope_block


class IndexDocumentRequest(BaseModel):
    session_id: str
    doc_id: str
    name: str
    content: str
    uploaded_at: int | None = None  # ms epoch, client clock — display only


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
    columns: list[TableColumn] = []  # table questions only
    related_questions: list[str] = []  # see _scope_block
    doc_ids: list[str] = []
    top_k: int = 6


def _options_block(options: list[str], question_type: str) -> str:
    """The multiple-choice instruction block shared by all extract prompts."""
    if not options:
        return ""
    formatted = "\n".join(f"- {opt}" for opt in options)
    kind = "meerdere opties mogelijk" if question_type == "checkbox" else "kies precies één optie"
    return (
        f"\n\nDit is een meerkeuzevraag ({kind}). Beschikbare antwoordopties (kies woordelijk):\n{formatted}"
    )


# AI Modus asks every question in its own call, in parallel, so no call sees
# the other answers — and the same fact used to land under every question that
# retrieved it. Naming the section's other questions lets the model leave their
# topics alone. Capped: a long list drowns the one question that matters.
_SCOPE_MAX_QUESTIONS = 12
_SCOPE_MAX_CHARS = 160


def _scope_block(related_questions: list[str]) -> str:
    related = [q.strip()[:_SCOPE_MAX_CHARS] for q in related_questions if q.strip()]
    if not related:
        return ""
    listed = "\n".join(f"- {q}" for q in related[:_SCOPE_MAX_QUESTIONS])
    return (
        "\n\n[ANDERE VRAGEN IN DIT ONDERDEEL — die worden apart beantwoord]\n"
        f"{listed}\n"
        "Beantwoord alleen de doelvraag. Laat inhoud weg die duidelijk het "
        "onderwerp van een van deze andere vragen is, ook als die in de "
        "fragmenten staat. Weiger NIET om die reden: wat de doelvraag zelf "
        "vraagt, beantwoord je volledig."
    )


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


def _xml_tag(raw: str, tag: str) -> str:
    """Content of the first <tag>…</tag> block in an LLM response, or ""."""
    m = re.search(rf"<{tag}>(.*?)</{tag}>", raw, re.DOTALL | re.IGNORECASE)
    return m.group(1).strip() if m else ""


def _parse_improve(raw: str, fallback: str) -> tuple[str, str]:
    return _xml_tag(raw, "verbeterd") or fallback, _xml_tag(raw, "toelichting")


def _extract_user_message(req: ExtractRequest) -> str:
    doc_parts = [
        f"=== Document: {doc.name} ===\n{doc.content.strip()}"
        for doc in req.documents
    ]
    return (
        f"Doelvraag waarvoor een antwoord nodig is:\n{req.target_question}"
        f"{_options_block(req.options, req.question_type)}"
        f"{_scope_block(req.related_questions)}\n\n"
        f"Brondocumenten:\n\n" + "\n\n".join(doc_parts)
    )


def _parse_synthesize(raw: str) -> tuple[str, str]:
    return _xml_tag(raw, "suggestie"), _xml_tag(raw, "toelichting")


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


_MAX_TABLE_ROWS = 25
# A markdown separator row cell: only dashes/colons/whitespace.
_TABLE_SEPARATOR_CELL_RE = re.compile(r"^[-–—\s:]*$")


def _normalize_for_grounding(text: str) -> str:
    return unicodedata.normalize("NFD", text.lower())


def _table_cell_grounded(cell: str, source_text: str) -> bool:
    """Grounding check for one table cell. Short cells must appear literally in
    the sources (same rule as shorttext); longer cells may be lightly rephrased,
    so we accept them when enough of their content words appear in the source."""
    if _grounded(cell, source_text):
        return True
    if len(cell) <= 30:
        return False
    words = {
        w for w in re.split(r"[^\w@.+-]+", _normalize_for_grounding(cell)) if len(w) >= 4
    }
    if not words:
        return False
    source_norm = _normalize_for_grounding(source_text)
    found = sum(1 for w in words if w in source_norm)
    return found / len(words) >= 0.6


def _validate_table_suggestion(
    suggestion: str, columns: list[TableColumn], source_text: str = ""
) -> str:
    """Table sibling of _validate_suggestion — kept separate because the label
    and question-echo stripping there would mangle pipe-separated rows. Blanks
    ungrounded cells, drops empty rows, and returns "" when nothing survives.
    Output: validated pipe rows, optionally followed by '---' and the note."""
    text = suggestion.strip()
    if not text or "onvoldoende informatie" in text.lower():
        return ""
    if text.lower().strip(".") in _PLACEHOLDERS:
        return ""
    if len(text) < 250 and _NO_INFO_PARAPHRASE_RE.search(text):
        return ""

    rows_part, _, notes_part = text.partition("\n---\n")
    labels = {c.label.strip().lower() for c in columns}

    rows: list[list[str]] = []
    for line in rows_part.splitlines():
        line = line.strip().strip("|").strip()
        if not line:
            continue
        cells = [c.strip() for c in line.split("|")]
        # Drop markdown separator rows and header rows echoing column labels.
        if all(_TABLE_SEPARATOR_CELL_RE.match(c) for c in cells):
            continue
        if all(c.lower() in labels or not c for c in cells) and any(cells):
            continue
        cells = (cells + [""] * len(columns))[: len(columns)]
        cells = [c if _table_cell_grounded(c, source_text) else "" for c in cells]
        if any(cells):
            rows.append(cells)
        if len(rows) >= _MAX_TABLE_ROWS:
            break
    if not rows:
        return ""

    note_lines = [ln for ln in notes_part.splitlines() if not _BRON_LINE_RE.match(ln)]
    notes = "\n".join(note_lines).strip()
    if notes and "onvoldoende informatie" in notes.lower():
        notes = ""
    if notes and len(notes) < 250 and _NO_INFO_PARAPHRASE_RE.search(notes):
        notes = ""

    result = "\n".join(" | ".join(row) for row in rows)
    return f"{result}\n---\n{notes}" if notes else result


def _make_table_extract_parser(columns: list[TableColumn], source_text: str = ""):
    def parse(raw: str) -> tuple[str, str]:
        suggestion, rationale = _parse_synthesize(raw)
        return _validate_table_suggestion(suggestion, columns, source_text), rationale

    return parse


_SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


async def _sse_stream(
    system_prompt: str,
    user_message: str,
    parse_fn,
    *,
    allow_clarification: bool = False,
    allow_diagram: bool = False,
    sources: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    raw = ""
    try:
        async for chunk in backend.stream(system_prompt, user_message):
            raw += chunk
            yield f"event: chunk\ndata: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
        if allow_clarification:
            question = _xml_tag(raw, "verduidelijking")
            if question:
                # The model needs more input; the client answers and re-requests.
                yield f"event: clarification\ndata: {json.dumps({'question': question}, ensure_ascii=False)}\n\n"
                return
        if allow_diagram:
            mermaid = _xml_tag(raw, "mermaid")
            if mermaid:
                yield f"event: diagram\ndata: {json.dumps({'mermaid': mermaid}, ensure_ascii=False)}\n\n"
        suggestion, rationale = parse_fn(raw)
        done_payload: dict = {"suggestion": suggestion, "rationale": rationale}
        if sources is not None:
            done_payload["sources"] = sources
        yield f"event: done\ndata: {json.dumps(done_payload, ensure_ascii=False)}\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'detail': str(e)}, ensure_ascii=False)}\n\n"


def _validated_improve_text(req: ImproveRequest) -> str:
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Tekst mag niet leeg zijn.")
    if len(text) > 8000:
        raise HTTPException(status_code=400, detail="Tekst is te lang (max 8000 tekens).")
    return text


def _extract_parser_for(req: "ExtractRequest | RagExtractRequest", source_text: str):
    """Table questions get their own validator; everything else the default."""
    if req.question_type == "table" and req.columns:
        return _make_table_extract_parser(req.columns, source_text)
    return _make_extract_parser(req.field_format, req.target_question, req.options, source_text)


@app.post("/api/improve/stream")
async def improve_text_stream(req: ImproveRequest) -> StreamingResponse:
    text = _validated_improve_text(req)
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


@app.post("/api/synthesize/stream")
async def synthesize_stream(req: SynthesizeRequest) -> StreamingResponse:
    if not req.source_answers:
        raise HTTPException(status_code=400, detail="Geen bronantwoorden opgegeven.")
    return StreamingResponse(
        _sse_stream(SYNTHESIZE_SYSTEM_PROMPT, _synthesize_user_message(req), _parse_synthesize),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ---------------------------------------------------------------------------
# RAG endpoints
# ---------------------------------------------------------------------------


async def _index_and_store(
    user_sub: str,
    session_id: str,
    doc_id: str,
    name: str,
    content: str,
    chunks: list[dict],
    uploaded_at: int | None,
) -> tuple[int, dict]:
    """Embed + store chunks, extract the ontology, persist the source text.

    Shared by both upload paths (pre-extracted text and server-side PDF) so
    they cannot drift. Returns (chunk_count, ontology).
    """
    try:
        index_task = rag.index_document(
            session_id=session_id,
            doc_id=doc_id,
            doc_name=name,
            chunks=chunks,
            embed_fn=backend.embed,
        )
        ontology_task = rag.extract_ontology(name, content, backend.chat)
        index_result, ontology = await asyncio.gather(index_task, ontology_task)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Indexering mislukt: [{type(e).__name__}] {e}") from e
    # Persist the source text per storage owner so a fresh browser (or wiped
    # localStorage) can restore the dossier's documents from the server.
    try:
        await asyncio.to_thread(
            docstore.save_document,
            user_sub=user_sub,
            session_id=session_id,
            doc_id=doc_id,
            name=name,
            content=content,
            ontology=ontology,
            chunk_count=index_result["chunk_count"],
            uploaded_at=uploaded_at,
        )
    except Exception as e:
        print(f"[docstore] opslaan van {doc_id} mislukt: {e}")  # index succeeded — don't fail the upload
    return index_result["chunk_count"], ontology


@app.post("/api/documents/index", response_model=IndexDocumentResponse)
async def index_document(req: IndexDocumentRequest, request: Request) -> IndexDocumentResponse:
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="Document is leeg.")
    # Resolve the storage owner up front: editors' uploads must land in the
    # dossier owner's directory or they'd be invisible to everyone else.
    user_sub = await dossiers.resolve_session_access(request, req.session_id, "editor")
    chunk_count, ontology = await _index_and_store(
        user_sub=user_sub,
        session_id=req.session_id,
        doc_id=req.doc_id,
        name=req.name,
        content=req.content,
        chunks=rag.chunk_document(req.content),
        uploaded_at=req.uploaded_at,
    )
    return IndexDocumentResponse(doc_id=req.doc_id, chunk_count=chunk_count, ontology=ontology)


PDF_MAX_BYTES = 25 * 1024 * 1024


async def _store_figures(
    user_sub: str,
    session_id: str,
    doc_id: str,
    blocks: list[dict],
) -> int:
    """Persist each rendered figure and tag its block with the imagestore id.

    The id travels with the block into the chunk row's `asset_id` column, which
    is what lets retrieval hand AI Modus the actual image instead of only the
    caption. Figures that could not be rendered (or that came out too big to
    attach) simply keep an empty asset_id and stay caption-only chunks —
    never a reason to fail the upload.
    """
    stored = 0
    for index, block in enumerate(b for b in blocks if b["type"] == "figure"):
        image = block.pop("image", None)
        if not image or len(image["png"]) > IMAGE_MAX_BYTES:
            continue
        meta = await asyncio.to_thread(
            imagestore.save_image,
            user_sub,
            session_id,
            f"figuur-p{block['page']}-{index + 1}.png",
            "image/png",
            image["png"],
            doc_id,
        )
        block["asset_id"] = meta["image_id"]
        stored += 1
    return stored


@app.post("/api/documents/upload")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
    doc_id: str = Form(...),
    uploaded_at: int | None = Form(None),
) -> dict:
    """Upload a PDF for server-side structured extraction, then index it.

    Unlike /api/documents/index (which takes text the browser already
    extracted), this keeps the PDF's tables and figures intact — see
    pdfextract.py for why that matters for retrieval.
    """
    data = await file.read(PDF_MAX_BYTES + 1)
    if len(data) > PDF_MAX_BYTES:
        raise HTTPException(status_code=413, detail="PDF is te groot (maximaal 25 MB).")
    # Don't trust the declared content-type — check the file signature.
    if not data.startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="Bestand is geen geldige PDF.")
    user_sub = await dossiers.resolve_session_access(request, session_id, "editor")

    try:
        extracted = await asyncio.to_thread(pdfextract.extract_pdf, data)
    except pdfextract.PdfNoTextError:
        # The client turns this code into the "gescande PDF" message.
        raise HTTPException(status_code=422, detail="PDF_NO_TEXT") from None
    except pdfextract.PdfUnreadableError as e:
        raise HTTPException(status_code=400, detail=f"PDF kon niet worden gelezen: {e}") from e

    blocks = pdfextract.render_blocks(extracted["blocks"])
    content = pdfextract.render_content(blocks)
    if not content.strip():
        raise HTTPException(status_code=422, detail="PDF_NO_TEXT")

    name = file.filename or "document.pdf"
    stored_figures = await _store_figures(user_sub, session_id, doc_id, blocks)
    chunk_count, ontology = await _index_and_store(
        user_sub=user_sub,
        session_id=session_id,
        doc_id=doc_id,
        name=name,
        content=content,
        chunks=rag.chunk_blocks(blocks),
        uploaded_at=uploaded_at,
    )
    return {
        "doc_id": doc_id,
        "name": name,
        "content": content,
        "chunk_count": chunk_count,
        "ontology": ontology,
        "page_count": extracted["page_count"],
        "table_count": sum(1 for b in blocks if b["type"] == "table"),
        "figure_count": sum(1 for b in blocks if b["type"] == "figure"),
        # Figures whose bytes were stored — only these can become an
        # attachment in AI Modus; the rest stay caption-only chunks.
        "stored_figure_count": stored_figures,
    }


@app.get("/api/ai/limits")
async def ai_limits() -> dict:
    """How many AI Modus questions the client may have in flight at once, and
    which model answers them (the client records it as the author of AI text)."""
    return {"max_concurrency": backend.max_concurrency, "model": backend.model_identifier}


@app.get("/api/documents")
async def list_documents(session_id: str, request: Request) -> dict:
    """The stored documents for one dossier (session) the caller may view."""
    user_sub = await dossiers.resolve_session_access(request, session_id, "viewer")
    docs = await asyncio.to_thread(docstore.list_documents, user_sub, session_id)
    return {"documents": docs}


@app.delete("/api/documents/{doc_id}")
async def remove_document(doc_id: str, session_id: str, request: Request) -> dict:
    user_sub = await dossiers.resolve_session_access(request, session_id, "editor")
    await rag.delete_document(session_id, doc_id)
    await asyncio.to_thread(docstore.delete_document, user_sub, doc_id)
    return {"deleted": doc_id}


class VerifyDocumentsRequest(BaseModel):
    session_id: str
    doc_ids: list[str]


@app.post("/api/documents/verify")
async def verify_documents(req: VerifyDocumentsRequest, request: Request) -> dict:
    """Return which doc_ids are actually present in the vector store.

    Self-heals first: a document whose chunks are gone from LanceDB but whose
    text is still in the docstore (Azure Files) is re-indexed from that text,
    so AI Modus keeps working without the user re-uploading. Only documents
    that can't be restored that way are reported missing.
    """
    owner_sub = await dossiers.resolve_session_access(request, req.session_id, "viewer")
    found = await rag.get_indexed_doc_ids(req.session_id, req.doc_ids)
    missing = [d for d in req.doc_ids if d not in found]
    if missing:
        restored = await _reindex_from_docstore(owner_sub, req.session_id, missing)
        found = [*found, *restored]
        missing = [d for d in missing if d not in restored]
    return {"found": found, "missing": missing}


# One re-index per document at a time: AI Modus on several open tabs (or several
# collaborators) can hit verify together, and they shouldn't all re-embed it.
_reindex_locks: dict[str, asyncio.Lock] = {}


async def _reindex_from_docstore(owner_sub: str, session_id: str, doc_ids: list[str]) -> list[str]:
    """Rebuild the vector chunks of `doc_ids` from their stored text. Returns
    the ids that were restored; failures are logged and left missing.

    PDFs were chunked from their structured blocks at upload; only the rendered
    text is stored, so a restored PDF is chunked as plain text. Tables come back
    as prose-adjacent chunks and figures lose their image link — good enough to
    answer from, and a re-upload brings the full structure back.
    """
    records = await asyncio.to_thread(docstore.list_documents, owner_sub, session_id)
    by_id = {r["doc_id"]: r for r in records}
    restored: list[str] = []
    for doc_id in doc_ids:
        record = by_id.get(doc_id)
        if not record or not (record.get("content") or "").strip():
            continue
        lock = _reindex_locks.setdefault(f"{session_id}/{doc_id}", asyncio.Lock())
        async with lock:
            # Another request may have restored it while we waited.
            if await rag.get_indexed_doc_ids(session_id, [doc_id]):
                restored.append(doc_id)
                continue
            try:
                result = await rag.index_document(
                    session_id=session_id,
                    doc_id=doc_id,
                    doc_name=record.get("name") or doc_id,
                    chunks=rag.chunk_document(record["content"]),
                    embed_fn=backend.embed,
                )
            except Exception as e:
                log.warning("re-index of %s (session %s) failed: %s", doc_id, session_id, e)
                continue
        if result["chunk_count"] > 0:
            log.warning("re-indexed %s (session %s) from docstore: %d chunks", doc_id, session_id, result["chunk_count"])
            restored.append(doc_id)
    return restored


# ---------------------------------------------------------------------------
# Image attachments (per-question uploads; bytes live server-side, the
# frontend keeps only metadata in localStorage)
# ---------------------------------------------------------------------------

IMAGE_MAX_BYTES = 5 * 1024 * 1024
# pdfmake can only embed PNG/JPEG, so uploads are restricted to those.
_IMAGE_MAGIC = {"image/png": b"\x89PNG", "image/jpeg": b"\xff\xd8\xff"}


@app.post("/api/images")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Form(...),
) -> dict:
    mime = (file.content_type or "").lower()
    if mime not in _IMAGE_MAGIC:
        raise HTTPException(status_code=400, detail="Alleen PNG- of JPEG-afbeeldingen zijn toegestaan.")
    data = await file.read(IMAGE_MAX_BYTES + 1)
    if len(data) > IMAGE_MAX_BYTES:
        raise HTTPException(status_code=413, detail="Afbeelding is te groot (maximaal 5 MB).")
    # Don't trust the declared content-type — check the file signature.
    if not data.startswith(_IMAGE_MAGIC[mime]):
        raise HTTPException(status_code=400, detail="Bestand is geen geldige PNG- of JPEG-afbeelding.")
    user_sub = await dossiers.resolve_session_access(request, session_id, "editor")
    meta = await asyncio.to_thread(
        imagestore.save_image,
        user_sub=user_sub,
        session_id=session_id,
        filename=file.filename or "afbeelding",
        mime=mime,
        data=data,
    )
    return {
        "image_id": meta["image_id"],
        "filename": meta["filename"],
        "mime": meta["mime"],
        "size": meta["size"],
    }


@app.get("/api/images/{image_id}")
async def get_image(image_id: str, session_id: str, request: Request) -> Response:
    # session_id is a query param because these URLs land in <img src>.
    # Lookup is scoped to the resolved storage owner's directory, so a viewer
    # of the dossier reads from the owner's files.
    user_sub = await dossiers.resolve_session_access(request, session_id, "viewer")
    result = await asyncio.to_thread(imagestore.load_image, user_sub, image_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Afbeelding niet gevonden.")
    data, meta = result
    return Response(
        content=data,
        media_type=meta["mime"],
        # Ids are unique per upload, so the bytes never change.
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@app.delete("/api/images/{image_id}")
async def remove_image(image_id: str, session_id: str, request: Request) -> dict:
    user_sub = await dossiers.resolve_session_access(request, session_id, "editor")
    await asyncio.to_thread(imagestore.delete_image, user_sub, image_id)
    return {"deleted": image_id}


def _fragment_label(chunk: dict) -> str:
    """Locator shown in a fragment header: page number when we have one."""
    page = chunk.get("page") or 0
    where = f"pagina {page}" if page else f"deel {chunk['chunk_index']}"
    kind = {"table": "tabel", "figure": "afbeelding"}.get(chunk.get("block_type", "text"))
    return f"{where}, {kind}" if kind else where


def _fragment_hint(chunk: dict) -> str:
    """Tell the model how to read a non-prose fragment. '' for plain text."""
    if chunk.get("block_type") == "table":
        return "\n[Dit fragment is een tabel; de cellen per rij zijn gescheiden door |.]"
    if chunk.get("block_type") == "figure":
        # The model still only sees the caption, but when the image itself was
        # extracted it is attached to the answer, so referring to it is honest.
        if chunk.get("asset_id"):
            return (
                "\n[Dit fragment is het bijschrift van een afbeelding. De afbeelding zelf "
                "wordt als bijlage bij dit antwoord geplaatst; je mag ernaar verwijzen, "
                "maar beschrijf niet wat erop staat.]"
            )
        return "\n[Dit fragment is het bijschrift van een afbeelding, niet de afbeelding zelf.]"
    return ""


def _source_payload(chunk: dict) -> dict:
    """One retrieved chunk as the frontend's AnswerSource.

    assetId/figureCaption are only present for figures whose image was
    extracted — they are what AI Modus turns into a question attachment, and
    sources are persisted per answer, so nothing empty is carried along.
    """
    payload = {
        "docId": chunk["doc_id"],
        "docName": chunk["doc_name"],
        "chunkIndex": chunk["chunk_index"],
        "text": chunk["text"],
        "score": chunk["score"],
        "page": chunk.get("page", 0),
        "blockType": chunk.get("block_type", "text"),
    }
    if chunk.get("block_type") == "figure" and chunk.get("asset_id"):
        payload["assetId"] = chunk["asset_id"]
        caption = pdfextract.figure_caption(chunk["text"])
        if caption:
            payload["figureCaption"] = caption
    return payload


def _rag_user_message(
    target_question: str,
    guidance: str,
    options: list[str],
    question_type: str,
    chunks: list[dict],
    related_questions: list[str] | None = None,
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

    if not chunks:
        excerpts_block = "(Geen relevante passages gevonden in de geïndexeerde documenten.)"
    else:
        excerpts_block = "\n\n".join(
            f"=== Fragment {i + 1} — {c['doc_name']} ({_fragment_label(c)}) ==={_fragment_hint(c)}\n"
            f"{c['text'].strip()}"
            for i, c in enumerate(chunks)
        )

    return (
        f"{question_block}{_options_block(options, question_type)}"
        f"{_scope_block(related_questions or [])}\n\n"
        f"Relevante passages uit de brondocumenten:\n\n{excerpts_block}"
    )


@app.post("/api/extract/rag/stream")
async def extract_rag_stream(req: RagExtractRequest, request: Request) -> StreamingResponse:
    if not req.target_question.strip():
        raise HTTPException(status_code=400, detail="Doelvraag mag niet leeg zijn.")
    # Role check before the stream starts so a denied caller gets a clean 403.
    await dossiers.resolve_session_access(request, req.session_id, "editor")
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

    user_msg = _rag_user_message(
        req.target_question, req.guidance, req.options, req.question_type, chunks, req.related_questions
    )
    system_prompt = _build_extract_system_prompt(
        req.question_type, req.field_format, req.form_context, req.columns
    )
    source_text = "\n".join(c["text"] for c in chunks)
    parse_fn = _extract_parser_for(req, source_text)
    sources = [_source_payload(c) for c in chunks]
    return StreamingResponse(
        _sse_stream(system_prompt, user_msg, parse_fn, sources=sources),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


if __name__ == "__main__":
    import uvicorn

    dev = "--dev" in sys.argv
    if dev:
        print("⚠️  --dev: Keycloak login bypassed, every request runs as the dev user.")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=dev)
