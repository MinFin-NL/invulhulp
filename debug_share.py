"""TEMPORARY diagnostics for the share modal — REMOVE after debugging.

The share dialog shows blank names/e-mails in both the search results and the
grants list, but the browser devtools are locked down. These admin-only routes
expose the raw data behind those two views so it can be read straight in the
browser (navigate to the URL; the JSON renders as text), telling us whether the
problem is the stored/Keycloak data or the frontend rendering.

    /api/debug/share/search?q=<naam>   — raw Keycloak hits vs. what /users/search returns
    /api/debug/share/grants            — every dossier you can see, its stored
                                         grants, and what Keycloak resolves them to

Both require the 'beheerder' role. Delete this module (and its include in
main.py) once the share modal is fixed.
"""

from __future__ import annotations

import asyncio

import httpx
from fastapi import APIRouter, Depends, Request

import auth
import dossierstore
import users
from admin_users import _kc

router = APIRouter(
    prefix="/api/debug/share",
    tags=["debug"],
    dependencies=[Depends(auth.require_admin)],
)


@router.get("/search")
async def debug_search(q: str, request: Request) -> dict:
    """Show the raw Keycloak search hits alongside what the real endpoint returns,
    so we can see whether Keycloak is handing back names/e-mails at all and how
    _display_name / the _is_me filter transform them."""
    me = auth.current_user(request)
    async with httpx.AsyncClient(timeout=15) as client:
        res = await _kc(client, "GET", "/users", params={"search": q, "max": 10})
    raw = res.json() if res.status_code == 200 else None
    return {
        "query": q,
        "keycloak_status": res.status_code,
        "me": {"sub": me.get("sub"), "email": me.get("email")},
        "raw_keycloak_users": [
            {
                "id": u.get("id"),
                "username": u.get("username"),
                "firstName": u.get("firstName"),
                "lastName": u.get("lastName"),
                "email": u.get("email"),
            }
            for u in (raw or [])
        ],
        # Exactly what the share modal receives from GET /api/users/search:
        "endpoint_returns": await users.search_users(q, request),
    }


@router.get("/grants")
async def debug_grants(request: Request) -> dict:
    """Dump the stored grants for every dossier the caller can see, plus what
    Keycloak resolves each grant's sub to. If grants_on_disk already carries
    name/email the problem is rendering; if it doesn't and resolve_users is empty
    the sub is stale/unknown in Keycloak."""
    me = auth.current_user(request)
    records = await asyncio.to_thread(
        dossierstore.list_dossiers_for, me.get("sub"), me.get("email")
    )
    out = []
    for record in records:
        grants = record.get("grants", [])
        subs = [g.get("sub") for g in grants if g.get("sub")]
        resolved = await users.resolve_users(subs)
        out.append(
            {
                "id": record.get("id"),
                "name": record.get("name"),
                "ownerSub": record.get("ownerSub"),
                "grants_on_disk": grants,
                "resolve_users_result": resolved,
            }
        )
    return {
        "me": {"sub": me.get("sub"), "email": me.get("email")},
        "dossier_count": len(out),
        "dossiers": out,
    }
