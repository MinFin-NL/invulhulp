"""
Persistent dossier store with per-user access grants.

Each dossier is one JSON file at DOSSIERS_PATH/{dossier_id}.json holding the
dossier envelope (name, sessionId, form answers) plus its access grants:
a list of {sub, email, name, role} where role is 'viewer' | 'editor' |
'owner'. The `ownerSub` field is the storage owner — the user whose
docstore/imagestore directory holds the dossier's files — and never changes,
even when co-owners are added (transferring storage ownership is a TODO).

The `forms` payload is opaque to the backend: it is the frontend's
Record<FormId, FormState> serialized as-is.

All functions are synchronous file I/O; callers wrap them in
asyncio.to_thread(). Writes are atomic (tmp + os.replace), which also holds
on the Azure Files SMB mount in production.

Environment variables:
    DOSSIERS_PATH — storage path (default: ./data/dossiers)
"""

from __future__ import annotations

import json
import os
from typing import Any

from dotenv import load_dotenv

from docstore import _safe

load_dotenv()

DOSSIERS_PATH = os.environ.get("DOSSIERS_PATH", "./data/dossiers")

ROLE_ORDER = {"viewer": 1, "editor": 2, "owner": 3}


def _path(dossier_id: str) -> str:
    return os.path.join(DOSSIERS_PATH, f"{_safe(dossier_id)}.json")


def save_dossier(record: dict[str, Any]) -> None:
    os.makedirs(DOSSIERS_PATH, exist_ok=True)
    # The sanitized id is canonical, so filename and record id always match.
    record["id"] = _safe(record["id"])
    path = _path(record["id"])
    tmp = f"{path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False)
    os.replace(tmp, path)  # atomic also on the SMB mount


def load_dossier(dossier_id: str) -> dict[str, Any] | None:
    try:
        with open(_path(dossier_id), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError, json.JSONDecodeError):
        return None


def delete_dossier(dossier_id: str) -> bool:
    try:
        os.remove(_path(dossier_id))
        return True
    except (OSError, ValueError):
        return False


def _iter_records():
    if not os.path.isdir(DOSSIERS_PATH):
        return
    for entry in sorted(os.listdir(DOSSIERS_PATH)):
        if not entry.endswith(".json"):
            continue
        try:
            with open(os.path.join(DOSSIERS_PATH, entry), encoding="utf-8") as f:
                yield json.load(f)
        except (OSError, json.JSONDecodeError):
            continue  # skip corrupt/partial files rather than break the list


def list_dossiers_for(user_sub: str) -> list[dict[str, Any]]:
    """All dossiers the user has a grant on.

    Full directory scan — fine at PoC scale. TODO: keep a sub→dossier index
    when the number of dossiers grows.
    """
    return [r for r in _iter_records() if role_of(r, user_sub)]


def find_by_session(session_id: str) -> dict[str, Any] | None:
    """The dossier owning a backend session_id (vector store / doc key).

    Full directory scan — TODO: in-memory session_id→dossier_id cache.
    """
    for record in _iter_records():
        if record.get("sessionId") == session_id:
            return record
    return None


def role_of(record: dict[str, Any], user_sub: str) -> str | None:
    for grant in record.get("grants", []):
        if grant.get("sub") == user_sub:
            return grant.get("role")
    return None
