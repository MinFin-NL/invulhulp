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

CHUNKS_TABLE = "chunks"

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


def chunk_document(text: str) -> list[str]:
    """Split text into semantic chunks by paragraph, merging to target size."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: list[str] = []
    buf = ""

    for p in paragraphs:
        if len(p) > CHUNK_MAX_CHARS:
            if buf:
                chunks.append(buf)
                buf = ""
            for i in range(0, len(p), CHUNK_TARGET_CHARS):
                chunks.append(p[i : i + CHUNK_TARGET_CHARS])
            continue

        if not buf:
            buf = p
        elif len(buf) + len(p) + 2 <= CHUNK_TARGET_CHARS:
            buf = f"{buf}\n\n{p}"
        else:
            chunks.append(buf)
            buf = p

    if buf:
        if chunks and len(buf) < CHUNK_MIN_CHARS:
            chunks[-1] = f"{chunks[-1]}\n\n{buf}"
        else:
            chunks.append(buf)

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
            pa.field("vector", pa.list_(pa.float32(), dim)),
        ]
    )
    return db.create_table(CHUNKS_TABLE, schema=schema)


def _replace_doc_rows(doc_id: str, rows: list[dict], dim: int) -> None:
    table = _table_for_dim(dim)
    # Remove any pre-existing rows for this doc_id (idempotent re-index)
    try:
        table.delete(f"doc_id = '{_escape(doc_id)}'")
    except Exception:
        pass
    table.add(rows)


async def index_document(
    session_id: str,
    doc_id: str,
    doc_name: str,
    content: str,
    embed_fn: EmbedFn,
) -> dict[str, Any]:
    """Chunk, embed, and store a document. Returns {chunk_count, chunks}."""
    chunks = chunk_document(content)
    if not chunks:
        return {"chunk_count": 0, "chunks": []}

    vectors = await embed_fn(chunks)
    if not vectors:
        return {"chunk_count": 0, "chunks": []}

    rows = [
        {
            "id": str(uuid.uuid4()),
            "session_id": session_id,
            "doc_id": doc_id,
            "doc_name": doc_name,
            "chunk_index": i,
            "text": chunk,
            "vector": vec,
        }
        for i, (chunk, vec) in enumerate(zip(chunks, vectors, strict=True))
    ]
    await asyncio.to_thread(_replace_doc_rows, doc_id, rows, len(vectors[0]))

    return {
        "chunk_count": len(chunks),
        "chunks": [{"index": i, "text": c} for i, c in enumerate(chunks)],
    }


def _delete_where(predicate: str) -> int:
    db = _get_db()
    if CHUNKS_TABLE not in db.table_names():
        return 0
    db.open_table(CHUNKS_TABLE).delete(predicate)
    return 1


async def delete_document(doc_id: str) -> int:
    """Remove all chunks for a doc_id. Returns number of tables touched."""
    return await asyncio.to_thread(_delete_where, f"doc_id = '{_escape(doc_id)}'")


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
        .select(["doc_id", "doc_name", "chunk_index", "text", "_distance"])
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
