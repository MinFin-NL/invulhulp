"""
RAG module: chunking, vector store (LanceDB) and ontology extraction.

Embeddings are provided by the caller as `embed_fn(texts) -> vectors`
(see llm.LLMBackend.embed) — this module doesn't know which provider is used.

Environment variables:
    LANCEDB_PATH — storage path (default: ./data/lancedb). May be a local
        directory or an object-store URI such as az://<container>/<path>.
        Azure Files (SMB) mounts are NOT supported: Lance commits manifests
        with rename-if-not-exists, which CIFS rejects (errno 95). In Azure,
        point this at Blob storage and provide AZURE_STORAGE_ACCOUNT_NAME /
        AZURE_STORAGE_ACCOUNT_KEY, which Lance reads from the environment.
"""

from __future__ import annotations

import asyncio
import functools
import json
import os
import re
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import lancedb
import pyarrow as pa
from dotenv import load_dotenv

load_dotenv()

LANCEDB_PATH = os.environ.get("LANCEDB_PATH", "./data/lancedb")

# v2 adds the block_type/page/asset_id columns. A LanceDB table's schema is
# frozen at creation, so the name is bumped rather than migrated: an existing
# "chunks" table is simply ignored and documents are re-uploaded — the same
# remedy already documented for changing the embedding dimension.
CHUNKS_TABLE = "chunks_v2"

# Chunking targets (in characters — rough proxy for tokens, ~4 chars per token)
CHUNK_TARGET_CHARS = 1600   # ~400 tokens
CHUNK_MAX_CHARS = 3200      # ~800 tokens
CHUNK_MIN_CHARS = 200       # merge anything smaller into the next chunk

# Embedder signature: a batch of texts in, one vector per text out.
EmbedFn = Callable[[list[str]], Awaitable[list[list[float]]]]

# NOTE: all LanceDB operations are synchronous, so they run via
# asyncio.to_thread() to keep the event loop free during indexing/search.
# TODO: once the chunks table grows past a few tens of thousands of rows,
# add an ANN vector index plus a scalar index on session_id — every search
# is currently a brute-force scan, which is fine at PoC scale.


@functools.lru_cache(maxsize=1)
def _get_db() -> lancedb.DBConnection:
    if "://" not in LANCEDB_PATH:  # object-store URIs need no local directory
        os.makedirs(LANCEDB_PATH, exist_ok=True)
    return lancedb.connect(LANCEDB_PATH)


def _escape(s: str) -> str:
    return s.replace("'", "''")


def _merge_paragraphs(paragraphs: list[tuple[str, int]]) -> list[tuple[str, int]]:
    """Greedily merge (text, page) paragraphs up to CHUNK_TARGET_CHARS.

    The page of a merged chunk is that of its first paragraph. An oversized
    paragraph is hard-sliced; a too-small trailing chunk joins the previous one.
    """
    chunks: list[tuple[str, int]] = []
    buf = ""
    buf_page = 0

    for text, page in paragraphs:
        if len(text) > CHUNK_MAX_CHARS:
            if buf:
                chunks.append((buf, buf_page))
                buf = ""
            for i in range(0, len(text), CHUNK_TARGET_CHARS):
                chunks.append((text[i : i + CHUNK_TARGET_CHARS], page))
            continue

        if not buf:
            buf, buf_page = text, page
        elif len(buf) + len(text) + 2 <= CHUNK_TARGET_CHARS:
            buf = f"{buf}\n\n{text}"
        else:
            chunks.append((buf, buf_page))
            buf, buf_page = text, page

    if buf:
        if chunks and len(buf) < CHUNK_MIN_CHARS:
            chunks[-1] = (f"{chunks[-1][0]}\n\n{buf}", chunks[-1][1])
        else:
            chunks.append((buf, buf_page))

    return chunks


def chunk_document(text: str) -> list[dict]:
    """Split plain text into semantic chunks by paragraph (non-PDF uploads)."""
    paragraphs = [(p.strip(), 0) for p in re.split(r"\n\s*\n", text) if p.strip()]
    return [
        {"text": t, "block_type": "text", "page": 0} for t, _ in _merge_paragraphs(paragraphs)
    ]


def _split_table(text: str, header_lines: int) -> list[str]:
    """Split an oversized table into row groups, repeating its header lines.

    header_lines covers the rendered caption plus the column-header row, so
    every part remains a self-describing table rather than loose rows.
    """
    rows = text.split("\n")
    if len(rows) <= header_lines + 1:
        return [text]
    header, body = rows[:header_lines], rows[header_lines:]
    header_len = sum(len(r) + 1 for r in header)
    parts: list[str] = []
    buf: list[str] = []
    for row in body:
        # +1 per newline; the header is re-added to every part.
        if buf and header_len + sum(len(r) + 1 for r in buf) + len(row) + 1 > CHUNK_TARGET_CHARS:
            parts.append("\n".join([*header, *buf]))
            buf = []
        buf.append(row)
    if buf:
        parts.append("\n".join([*header, *buf]))
    return parts


# How much of the preceding prose is prepended to a table/figure before
# embedding. Enough to carry the section's topic, short enough not to drown out
# the cells themselves.
EMBED_CONTEXT_CHARS = 400


def _embed_context(lead_in: str, text: str) -> str:
    """The string to embed for a table/figure: preceding prose + the block.

    Takes the *tail* of the preceding prose: the block immediately above a
    table is often a bare caption ("Voorbeeld voor rapportagemodel"), so one
    block back is not enough to carry the section's topic.
    """
    lead_in = lead_in[-EMBED_CONTEXT_CHARS:].strip()
    if not lead_in:
        return text
    return f"{lead_in}\n\n{text}"


def chunk_blocks(blocks: list[dict]) -> list[dict]:
    """Chunk rendered PDF blocks, keeping tables and figures intact.

    A table is never merged with prose and never split mid-row, so a retrieved
    fragment is always a readable table. A figure's caption stays its own chunk
    so the page association survives. Runs of prose merge as usual.

    Tables and figures also get an `embed_text` that prepends the prose leading
    up to them. A bare grid of pipe-separated cells has almost no semantic
    surface, so without this a perfectly extracted table never survives
    retrieval against a question phrased in prose — see _embed_context.
    """
    chunks: list[dict] = []
    prose: list[tuple[str, int]] = []
    lead_in = ""

    def flush_prose() -> None:
        for text, page in _merge_paragraphs(prose):
            chunks.append({"text": text, "block_type": "text", "page": page})
        prose.clear()

    for block in blocks:
        text = block["text"].strip()
        if not text:
            continue
        if block["type"] == "text":
            prose.append((text, block["page"]))
            # Rolling window of what came before, trimmed so it cannot grow
            # unbounded over a long document.
            lead_in = f"{lead_in}\n\n{text}"[-(EMBED_CONTEXT_CHARS * 2) :]
            continue
        flush_prose()
        # A rendered table opens with its "Tabel — pagina N" caption followed
        # by the column-header row; both are repeated in every split part.
        parts = (
            _split_table(text, 2)
            if block["type"] == "table" and len(text) > CHUNK_MAX_CHARS
            else [text]
        )
        for part in parts:
            chunks.append(
                {
                    "text": part,
                    "embed_text": _embed_context(lead_in, part),
                    "block_type": block["type"],
                    "page": block["page"],
                    "asset_id": block.get("asset_id", ""),
                }
            )
    flush_prose()
    return chunks


def _table_for_dim(dim: int) -> Any:
    db = _get_db()
    if CHUNKS_TABLE in db.table_names():
        return db.open_table(CHUNKS_TABLE)
    schema = pa.schema(
        [
            pa.field("id", pa.string()),
            pa.field("session_id", pa.string()),
            pa.field("doc_id", pa.string()),
            pa.field("doc_name", pa.string()),
            pa.field("chunk_index", pa.int32()),
            pa.field("text", pa.string()),
            # "text" | "table" | "figure" — lets the prompt tell the model what
            # kind of fragment it is looking at (pipe rows vs prose).
            pa.field("block_type", pa.string()),
            pa.field("page", pa.int32()),  # 0 for non-paginated sources
            pa.field("asset_id", pa.string()),  # imagestore id for figures, "" otherwise
            pa.field("vector", pa.list_(pa.float32(), dim)),
        ]
    )
    return db.create_table(CHUNKS_TABLE, schema=schema)


def _doc_predicate(session_id: str, doc_id: str) -> str:
    # Always scoped to the session: doc_ids are visible to anyone who can view
    # a dossier, so a doc_id-only predicate would let a caller authorized on
    # their *own* session delete or overwrite another dossier's chunks.
    return f"session_id = '{_escape(session_id)}' AND doc_id = '{_escape(doc_id)}'"


def _replace_doc_rows(session_id: str, doc_id: str, rows: list[dict], dim: int) -> None:
    table = _table_for_dim(dim)
    # Remove any pre-existing rows for this doc_id (idempotent re-index)
    try:
        table.delete(_doc_predicate(session_id, doc_id))
    except Exception:
        pass
    table.add(rows)


async def index_document(
    session_id: str,
    doc_id: str,
    doc_name: str,
    chunks: list[dict],
    embed_fn: EmbedFn,
) -> dict[str, Any]:
    """Embed and store pre-built chunks. Returns {chunk_count, chunks}.

    Chunks come from chunk_document() for plain-text uploads or chunk_blocks()
    for PDFs; each is {text, block_type, page, asset_id?, embed_text?}.

    `text` is what gets stored, cited and shown; `embed_text` (when present) is
    what gets vectorised. They differ for tables and figures, whose own content
    is too sparse to retrieve on.
    """
    if not chunks:
        return {"chunk_count": 0, "chunks": []}

    vectors = await embed_fn([c.get("embed_text") or c["text"] for c in chunks])
    if not vectors:
        return {"chunk_count": 0, "chunks": []}

    rows = [
        {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "doc_id": doc_id,
            "doc_name": doc_name,
            "chunk_index": i,
            "text": chunk["text"],
            "block_type": chunk.get("block_type", "text"),
            "page": int(chunk.get("page", 0)),
            "asset_id": chunk.get("asset_id", "") or "",
            "vector": vec,
        }
        for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True))
    ]
    await asyncio.to_thread(_replace_doc_rows, session_id, doc_id, rows, len(vectors[0]))

    return {
        "chunk_count": len(chunks),
        "chunks": [{"index": i, "text": c["text"]} for i, c in enumerate(chunks)],
    }


def _delete_where(predicate: str) -> int:
    db = _get_db()
    if CHUNKS_TABLE not in db.table_names():
        return 0
    db.open_table(CHUNKS_TABLE).delete(predicate)
    return 1


async def delete_document(session_id: str, doc_id: str) -> int:
    """Remove all chunks of one document in one session. Returns number of
    tables touched."""
    return await asyncio.to_thread(_delete_where, _doc_predicate(session_id, doc_id))


async def delete_session(session_id: str) -> int:
    return await asyncio.to_thread(_delete_where, f"session_id = '{_escape(session_id)}'")


def _indexed_doc_ids_sync(session_id: str, doc_ids: list[str]) -> list[str]:
    db = _get_db()
    if CHUNKS_TABLE not in db.table_names():  # table_names() returns a plain list
        return []
    table = db.open_table(CHUNKS_TABLE)
    sid = _escape(session_id)
    ids_sql = ", ".join(f"'{_escape(d)}'" for d in doc_ids)
    try:
        rows = (
            table.search()
            .where(f"session_id = '{sid}' AND doc_id IN ({ids_sql})", prefilter=True)
            .select(["doc_id"])
            .limit(len(doc_ids) * 100)
            .to_list()
        )
        return list({r["doc_id"] for r in rows})
    except Exception:
        return doc_ids  # fail open — don't block AI mode on verify errors


async def get_indexed_doc_ids(session_id: str, doc_ids: list[str]) -> list[str]:
    """Return which of the given doc_ids are actually present in the vector store."""
    if not doc_ids:
        return []
    return await asyncio.to_thread(_indexed_doc_ids_sync, session_id, doc_ids)


def _search_sync(query_vec: list[float], where: str, top_k: int) -> list[dict]:
    db = _get_db()
    if CHUNKS_TABLE not in db.table_names():
        return []
    table = db.open_table(CHUNKS_TABLE)
    return (
        table.search(query_vec)
        .where(where, prefilter=True)
        # Skip the vector column; "_distance" must be requested explicitly
        # in newer LanceDB versions.
        .select(
            [
                "doc_id",
                "doc_name",
                "chunk_index",
                "text",
                "block_type",
                "page",
                "asset_id",
                "_distance",
            ]
        )
        .limit(top_k)
        .to_list()
    )


async def retrieve(
    session_id: str,
    query: str,
    embed_fn: EmbedFn,
    top_k: int = 6,
    doc_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """Return top-k most similar chunks for the query, scoped to session."""
    [query_vec] = await embed_fn([query])

    where = f"session_id = '{_escape(session_id)}'"
    if doc_ids:
        ids = ", ".join(f"'{_escape(d)}'" for d in doc_ids)
        where += f" AND doc_id IN ({ids})"

    results = await asyncio.to_thread(_search_sync, query_vec, where, top_k)
    return [
        {
            "doc_id": r["doc_id"],
            "doc_name": r["doc_name"],
            "chunk_index": r["chunk_index"],
            "text": r["text"],
            "block_type": r.get("block_type") or "text",
            "page": int(r.get("page") or 0),
            # imagestore id of the figure this chunk describes; "" for prose,
            # tables, and figures whose bytes could not be extracted.
            "asset_id": r.get("asset_id") or "",
            "score": float(r.get("_distance", 0.0)),
        }
        for r in results
    ]


# ---------------------------------------------------------------------------
# Ontology extraction
# ---------------------------------------------------------------------------

ONTOLOGY_SYSTEM_PROMPT = (
    "Je bent een assistent die documenten analyseert voor compliance- en "
    "projectdocumentatie van de Nederlandse overheid (Ministerie van Financiën).\n\n"
    "Lees het document en haal de feitelijke informatie eruit in een gestructureerd "
    "JSON-overzicht. Verzin NIETS — gebruik alleen wat letterlijk in het document staat.\n\n"
    "Geef je antwoord uitsluitend als geldig JSON met deze structuur:\n"
    "{\n"
    '  "samenvatting": "één à twee zinnen die de kern van het document beschrijven",\n'
    '  "onderwerpen": ["korte topic-labels"],\n'
    '  "entiteiten": {\n'
    '    "personen": ["naam (rol indien bekend)"],\n'
    '    "organisaties": ["organisatie of afdeling"],\n'
    '    "systemen": ["genoemde IT-systemen, modellen, applicaties"],\n'
    '    "datasoorten": ["soorten persoons- of bedrijfsgegevens die genoemd worden"]\n'
    "  },\n"
    '  "besluiten": [{"tekst": "het besluit", "datum": "YYYY-MM-DD of leeg"}],\n'
    '  "openstaande_vragen": ["vragen of acties die nog open staan"],\n'
    '  "relaties": [{"van": "entiteit", "naar": "entiteit", "type": "korte werkwoordvorm"}]\n'
    "}\n\n"
    "Laat lijsten leeg als er geen informatie is. Geen markdown, geen toelichting, alleen JSON."
)


async def extract_ontology(
    doc_name: str,
    content: str,
    chat_fn: Any,
) -> dict[str, Any]:
    """Run the ontology extraction LLM call. `chat_fn(system, user) -> str`."""
    user_msg = f"Documentnaam: {doc_name}\n\nDocumentinhoud:\n{content.strip()}"
    raw = await chat_fn(ONTOLOGY_SYSTEM_PROMPT, user_msg)
    return _parse_json_loose(raw)


def _parse_json_loose(raw: str) -> dict[str, Any]:
    """Best-effort JSON extraction from an LLM response."""
    raw = raw.strip()
    # Strip markdown code fences if present
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw, re.DOTALL)
    if fence:
        raw = fence.group(1)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Try to find the first {...} block
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass
    return {
        "samenvatting": "",
        "onderwerpen": [],
        "entiteiten": {"personen": [], "organisaties": [], "systemen": [], "datasoorten": []},
        "besluiten": [],
        "openstaande_vragen": [],
        "relaties": [],
        "_parse_error": True,
    }


def ontology_summary_text(ontology: dict[str, Any]) -> str:
    """Render an ontology dict as compact text for inclusion in LLM prompts."""
    if not ontology:
        return ""
    parts: list[str] = []
    if s := ontology.get("samenvatting"):
        parts.append(f"Samenvatting: {s}")
    if topics := ontology.get("onderwerpen"):
        parts.append(f"Onderwerpen: {', '.join(topics)}")
    ent = ontology.get("entiteiten") or {}
    for label, key in [
        ("Personen", "personen"),
        ("Organisaties", "organisaties"),
        ("Systemen", "systemen"),
        ("Datasoorten", "datasoorten"),
    ]:
        vals = ent.get(key) or []
        if vals:
            parts.append(f"{label}: {', '.join(vals)}")
    if decisions := ontology.get("besluiten"):
        ds = [f"{d.get('tekst', '')} ({d.get('datum', '')})".strip() for d in decisions]
        parts.append("Besluiten: " + "; ".join(ds))
    return "\n".join(parts)
