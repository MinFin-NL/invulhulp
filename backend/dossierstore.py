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
import uuid
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
    # Per-write unique temp name: two clients pushing the same shared dossier
    # concurrently (collaboration) must not race on one .tmp path — otherwise one
    # rename wins and the other raises FileNotFoundError on the vanished temp.
    tmp = f"{path}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False)
        os.replace(tmp, path)  # atomic also on the SMB mount
    except BaseException:
        # Don't leak the temp file if writing/renaming failed.
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


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


def list_dossiers_for(user_sub: str, user_email: str | None = None) -> list[dict[str, Any]]:
    """All dossiers the user has a grant on.

    Full directory scan — fine at PoC scale. TODO: keep a sub→dossier index
    when the number of dossiers grows.
    """
    return [r for r in _iter_records() if role_of(r, user_sub, user_email)]


def find_by_session(session_id: str) -> dict[str, Any] | None:
    """The dossier owning a backend session_id (vector store / doc key).

    Full directory scan — TODO: in-memory session_id→dossier_id cache.
    """
    for record in _iter_records():
        if record.get("sessionId") == session_id:
            return record
    return None


def _norm_email(email: str | None) -> str:
    return (email or "").strip().lower()


def grant_for(
    record: dict[str, Any], user_sub: str | None, user_email: str | None = None
) -> dict[str, Any] | None:
    """The caller's access grant on this dossier.

    The grant's primary key is the Keycloak `sub`, but subs are not eternal: a
    Keycloak realm reseed hands the same person a fresh UUID (see auth.py), so a
    grant written under an old sub would otherwise orphan its owner. Email
    survives reseeds, so when no sub matches we fall back to matching on email.
    Use reconcile_identity() to heal the stored sub to the caller's live one.
    """
    grants = record.get("grants", [])
    for grant in grants:
        if grant.get("sub") == user_sub:
            return grant
    email = _norm_email(user_email)
    if email:
        for grant in grants:
            if _norm_email(grant.get("email")) == email:
                return grant
    return None


def role_of(
    record: dict[str, Any], user_sub: str | None, user_email: str | None = None
) -> str | None:
    grant = grant_for(record, user_sub, user_email)
    return grant.get("role") if grant else None


def _dedupe_grants(grants: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse grants that share a sub (can happen after a heal merges an old
    orphaned grant into one the user already had), keeping the strongest role
    and the richest name/email. Order is preserved."""
    by_sub: dict[Any, dict[str, Any]] = {}
    order: list[Any] = []
    for grant in grants:
        sub = grant.get("sub")
        if sub not in by_sub:
            by_sub[sub] = dict(grant)
            order.append(sub)
            continue
        kept = by_sub[sub]
        if ROLE_ORDER.get(grant.get("role"), 0) > ROLE_ORDER.get(kept.get("role"), 0):
            kept["role"] = grant.get("role")
        kept["email"] = kept.get("email") or grant.get("email")
        kept["name"] = kept.get("name") or grant.get("name")
    return [by_sub[sub] for sub in order]


def reconcile_identity(
    record: dict[str, Any], user_sub: str | None, user_email: str | None
) -> bool:
    """Re-anchor the caller's access grant on their current (live) sub.

    A Keycloak realm reseed hands the same person a new sub, which would orphan
    them from dossiers whose grants store the old one. Email survives reseeds,
    so when a grant matches the caller by email but carries a different sub we
    heal that grant's sub in place and persist. Returns True if anything changed.

    `ownerSub` is deliberately left untouched: it is the on-disk storage
    directory key (see the module docstring and docstore._user_dir), and the
    dossier's uploaded documents/images physically live under the original sub
    on the durable share. Repointing it would strand those files. Only the ACL
    (grants) is healed; storage stays where it is.
    """
    email = _norm_email(user_email)
    if not email or not user_sub:
        return False
    changed = False
    for grant in record.get("grants", []):
        if grant.get("sub") != user_sub and _norm_email(grant.get("email")) == email:
            grant["sub"] = user_sub
            changed = True
    if changed:
        record["grants"] = _dedupe_grants(record.get("grants", []))
        save_dossier(record)
    return changed
