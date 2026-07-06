"""
Persistent per-user document store.

Uploaded document text (plus ontology and chunk count) is written as one JSON
file per document under DOCS_PATH/{user_sub}/{doc_id}.json. In production
DOCS_PATH lives on an Azure Files volume mounted at /data, so documents — like
the LanceDB chunks next to them — survive container restarts and redeploys.

All functions are synchronous file I/O; callers wrap them in
asyncio.to_thread() (documents are small, but keep the event loop free).

Environment variables:
    DOCS_PATH — storage path (default: ./data/docs)
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

from dotenv import load_dotenv

load_dotenv()

DOCS_PATH = os.environ.get("DOCS_PATH", "./data/docs")

# user subs are Keycloak UUIDs and doc_ids are client-generated slugs, but
# both end up in filesystem paths — allow only a safe character set.
_SAFE_RE = re.compile(r"[^a-zA-Z0-9_-]")


def _safe(name: str) -> str:
    cleaned = _SAFE_RE.sub("_", name.strip())
    if not cleaned:
        raise ValueError("lege identifier")
    return cleaned[:128]


def _user_dir(user_sub: str) -> str:
    return os.path.join(DOCS_PATH, _safe(user_sub))


def _doc_path(user_sub: str, doc_id: str) -> str:
    return os.path.join(_user_dir(user_sub), f"{_safe(doc_id)}.json")


def save_document(
    user_sub: str,
    session_id: str,
    doc_id: str,
    name: str,
    content: str,
    ontology: dict[str, Any] | None = None,
    chunk_count: int = 0,
    uploaded_at: int | None = None,
) -> None:
    os.makedirs(_user_dir(user_sub), exist_ok=True)
    record = {
        "doc_id": doc_id,
        "session_id": session_id,
        "name": name,
        "content": content,
        "ontology": ontology or {},
        "chunk_count": chunk_count,
        "uploaded_at": uploaded_at,
    }
    path = _doc_path(user_sub, doc_id)
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False)
    os.replace(tmp, path)  # atomic also on the SMB mount


def list_documents(user_sub: str, session_id: str | None = None) -> list[dict[str, Any]]:
    """All stored documents for a user, optionally filtered to one dossier."""
    directory = _user_dir(user_sub)
    if not os.path.isdir(directory):
        return []
    docs: list[dict[str, Any]] = []
    for entry in sorted(os.listdir(directory)):
        if not entry.endswith(".json"):
            continue
        try:
            with open(os.path.join(directory, entry), encoding="utf-8") as f:
                record = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue  # skip corrupt/partial files rather than break the list
        if session_id is None or record.get("session_id") == session_id:
            docs.append(record)
    return docs


def delete_document(user_sub: str, doc_id: str) -> bool:
    try:
        os.remove(_doc_path(user_sub, doc_id))
        return True
    except (OSError, ValueError):
        return False


def delete_session(user_sub: str, session_id: str) -> int:
    """Remove all of the user's documents belonging to one dossier."""
    removed = 0
    for record in list_documents(user_sub, session_id):
        if delete_document(user_sub, record["doc_id"]):
            removed += 1
    return removed
