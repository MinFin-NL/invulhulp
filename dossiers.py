"""
Dossier CRUD + sharing (per-user access grants).

Dossiers used to live only in the browser (Pinia → localStorage); this router
gives them a server home so they can be shared between accounts. The frontend
pushes the whole dossier envelope with a debounced PUT (last-write-wins;
optimistic concurrency is a TODO) and pulls the list on startup.

Roles per dossier: 'viewer' (lezen), 'editor' (bewerken), 'owner' (eigenaar).
The creator becomes the first owner; co-owners are allowed, but a dossier must
always keep at least one owner. `ownerSub` is the storage owner whose
docstore/imagestore directory holds the dossier's files — see dossierstore.

`resolve_session_access` is the bridge for the existing session_id-keyed
endpoints in main.py (documents, images, RAG): it checks the caller's role on
the dossier owning that session and returns the storage sub to read/write
under. Sessions without a dossier record (pre-migration state, --dev) fall
back to the old behavior: the caller is treated as owner of their own files.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

import auth
import docstore
import dossierstore
import imagestore
import rag
from dossierstore import ROLE_ORDER

router = APIRouter(prefix="/api/dossiers", tags=["dossiers"])


def _require_role(record: dict[str, Any], user_sub: str, minimum: str) -> str:
    role = dossierstore.role_of(record, user_sub)
    if role is None:
        raise HTTPException(status_code=403, detail="Geen toegang tot dit dossier")
    if ROLE_ORDER[role] < ROLE_ORDER[minimum]:
        raise HTTPException(status_code=403, detail="Onvoldoende rechten voor deze actie")
    return role


async def resolve_session_access(request: Request, session_id: str, minimum: str) -> str:
    """Check the caller's role on the dossier owning `session_id` and return
    the storage sub (whose docstore/imagestore dir holds the files)."""
    user_sub = auth.current_user(request).get("sub") or "anonymous"
    record = await asyncio.to_thread(dossierstore.find_by_session, session_id)
    if record is None:
        # No server dossier yet (unmigrated local dossier, --dev): the caller
        # owns their own files, exactly as before sharing existed.
        return user_sub
    _require_role(record, user_sub, minimum)
    return record.get("ownerSub") or user_sub


def _view(record: dict[str, Any], user_sub: str) -> dict[str, Any]:
    """A dossier record as the frontend sees it, with computed fields."""
    role = dossierstore.role_of(record, user_sub)
    owner = next((g for g in record.get("grants", []) if g.get("role") == "owner"), None)
    return {
        **record,
        "myRole": role,
        "ownerName": (owner or {}).get("name") or (owner or {}).get("email"),
        "sharedWithMe": record.get("ownerSub") != user_sub,
    }


class DossierPayload(BaseModel):
    name: str
    sessionId: str
    createdAt: int
    updatedAt: int | None = None
    activeFormId: str | None = None
    # Opaque frontend payload: Record<FormId, FormState>.
    forms: dict[str, Any] = {}


class GrantBody(BaseModel):
    role: str
    email: str | None = None
    name: str | None = None


@router.get("")
async def list_dossiers(request: Request) -> dict:
    user_sub = auth.current_user(request).get("sub") or "anonymous"
    records = await asyncio.to_thread(dossierstore.list_dossiers_for, user_sub)
    return {"dossiers": [_view(r, user_sub) for r in records]}


@router.get("/{dossier_id}")
async def get_dossier(dossier_id: str, request: Request) -> dict:
    user_sub = auth.current_user(request).get("sub") or "anonymous"
    record = await asyncio.to_thread(dossierstore.load_dossier, dossier_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Dossier niet gevonden")
    _require_role(record, user_sub, "viewer")
    return _view(record, user_sub)


@router.put("/{dossier_id}")
async def put_dossier(dossier_id: str, body: DossierPayload, request: Request) -> dict:
    user = auth.current_user(request)
    user_sub = user.get("sub") or "anonymous"
    existing = await asyncio.to_thread(dossierstore.load_dossier, dossier_id)
    if existing is None:
        # Create-if-absent: this is also the migration path for dossiers that
        # so far lived only in the caller's localStorage.
        record = {
            "id": dossier_id,
            "ownerSub": user_sub,
            "grants": [
                {
                    "sub": user_sub,
                    "email": user.get("email"),
                    "name": user.get("name"),
                    "role": "owner",
                }
            ],
        }
    else:
        _require_role(existing, user_sub, "editor")
        # ownerSub and grants are never client-writable through this endpoint.
        record = {
            "id": existing["id"],
            "ownerSub": existing.get("ownerSub"),
            "grants": existing.get("grants", []),
        }
    record.update(
        name=body.name,
        sessionId=body.sessionId,
        createdAt=body.createdAt,
        updatedAt=body.updatedAt or int(time.time() * 1000),
        activeFormId=body.activeFormId,
        forms=body.forms,
    )
    await asyncio.to_thread(dossierstore.save_dossier, record)
    return _view(record, user_sub)


@router.delete("/{dossier_id}")
async def delete_dossier(dossier_id: str, request: Request) -> dict:
    user_sub = auth.current_user(request).get("sub") or "anonymous"
    record = await asyncio.to_thread(dossierstore.load_dossier, dossier_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Dossier niet gevonden")
    _require_role(record, user_sub, "owner")
    # Cascade like main.py's DELETE /api/sessions/{id}, keyed on the storage
    # owner so shared documents/images are cleaned up too.
    storage_sub = record.get("ownerSub") or user_sub
    session_id = record.get("sessionId")
    if session_id:
        await rag.delete_session(session_id)
        await asyncio.to_thread(docstore.delete_session, storage_sub, session_id)
        await asyncio.to_thread(imagestore.delete_session_images, storage_sub, session_id)
    await asyncio.to_thread(dossierstore.delete_dossier, dossier_id)
    return {"deleted": dossier_id}


def _owner_count(record: dict[str, Any]) -> int:
    return sum(1 for g in record.get("grants", []) if g.get("role") == "owner")


@router.put("/{dossier_id}/grants/{sub}")
async def set_grant(dossier_id: str, sub: str, body: GrantBody, request: Request) -> dict:
    if body.role not in ROLE_ORDER:
        raise HTTPException(status_code=422, detail="Ongeldige rol")
    user_sub = auth.current_user(request).get("sub") or "anonymous"
    record = await asyncio.to_thread(dossierstore.load_dossier, dossier_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Dossier niet gevonden")
    _require_role(record, user_sub, "owner")

    grants = record.setdefault("grants", [])
    existing = next((g for g in grants if g.get("sub") == sub), None)
    if existing:
        if existing.get("role") == "owner" and body.role != "owner" and _owner_count(record) <= 1:
            raise HTTPException(status_code=400, detail="Een dossier moet minimaal één eigenaar hebben")
        existing["role"] = body.role
        if body.email:
            existing["email"] = body.email
        if body.name:
            existing["name"] = body.name
    else:
        grants.append({"sub": sub, "email": body.email, "name": body.name, "role": body.role})
    await asyncio.to_thread(dossierstore.save_dossier, record)
    return {"grants": record["grants"]}


@router.delete("/{dossier_id}/grants/{sub}")
async def remove_grant(dossier_id: str, sub: str, request: Request) -> dict:
    user_sub = auth.current_user(request).get("sub") or "anonymous"
    record = await asyncio.to_thread(dossierstore.load_dossier, dossier_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Dossier niet gevonden")
    # Owners manage grants; any user may remove their own grant ("leave").
    if sub != user_sub:
        _require_role(record, user_sub, "owner")
    else:
        _require_role(record, user_sub, "viewer")

    grants = record.get("grants", [])
    target = next((g for g in grants if g.get("sub") == sub), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Deze gebruiker heeft geen toegang")
    if target.get("role") == "owner" and _owner_count(record) <= 1:
        raise HTTPException(status_code=400, detail="Een dossier moet minimaal één eigenaar hebben")
    record["grants"] = [g for g in grants if g.get("sub") != sub]
    await asyncio.to_thread(dossierstore.save_dossier, record)
    return {"grants": record["grants"]}
