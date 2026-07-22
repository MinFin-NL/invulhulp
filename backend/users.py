"""
Gebruikers zoeken voor het delen van dossiers.

Anders dan admin_users.py is dit endpoint beschikbaar voor iedere ingelogde
gebruiker (de globale require_user-gate in main.py volstaat): wie een dossier
wil delen moet een collega kunnen opzoeken. Het hergebruikt de Keycloak
Admin-API-client van admin_users (service account findocs-admin), maar geeft
alleen id/naam/e-mail terug — geen rollen of status, zodat de volledige
gebruikersadministratie niet uitlekt naar niet-beheerders.
"""

from __future__ import annotations

from typing import Iterable

import httpx
from fastapi import APIRouter, HTTPException, Request

import auth
from admin_users import _kc

router = APIRouter(prefix="/api/users", tags=["users"])

# In --dev is er geen Keycloak; een stub-collega maakt de deel-dialoog demobaar.
_DEV_USERS = [
    {"id": "dev2", "name": "Demo Collega", "email": "collega@example.nl"},
    {"id": "dev3", "name": "Tweede Collega", "email": "tweede@example.nl"},
]


@router.get("/search")
async def search_users(q: str, request: Request) -> list[dict]:
    q = q.strip()
    if len(q) < 2:
        return []
    me = auth.current_user(request)
    me_sub = me.get("sub")
    # Match self on email too: a Keycloak reseed gives the caller a fresh sub,
    # so a stale session sub would no longer equal the live id and the user
    # would see themselves in the results. Email survives reseeds.
    me_email = (me.get("email") or "").strip().lower()

    def _is_me(u: dict) -> bool:
        return u["id"] == me_sub or (
            bool(me_email) and (u.get("email") or "").strip().lower() == me_email
        )

    if auth.DEV_AUTH_BYPASS:
        needle = q.lower()
        return [
            u
            for u in _DEV_USERS
            if needle in u["name"].lower() or needle in u["email"].lower()
        ]
    async with httpx.AsyncClient(timeout=15) as client:
        res = await _kc(client, "GET", "/users", params={"search": q, "max": 10})
    if res.status_code != 200:
        return []
    return [
        {
            "id": u["id"],
            "name": _display_name(u),
            "email": u.get("email"),
        }
        for u in res.json()
        if not (u.get("username") or "").startswith("service-account-") and not _is_me(u)
    ]


def _display_name(u: dict) -> str | None:
    return f"{u.get('firstName') or ''} {u.get('lastName') or ''}".strip() or u.get("username")


async def resolve_users(subs: Iterable[str]) -> dict[str, dict]:
    """Look up display name + e-mail for the given Keycloak user ids.

    Used to fill in dossier grants whose name/email weren't captured at share
    time — notably the owner grant, which is built from OIDC claims that may
    lack the profile/email scopes. The Keycloak Admin API is the authoritative
    source (firstName/lastName/email), independent of what the login token
    happened to carry. Unknown or unreachable users are omitted so the caller
    can fall back to the raw sub instead of failing the whole request.
    """
    ids = list(dict.fromkeys(s for s in subs if s))
    if not ids:
        return {}
    if auth.DEV_AUTH_BYPASS:
        dev = auth.DEV_USER
        known = {u["id"]: u for u in _DEV_USERS}
        known[dev["sub"]] = {"id": dev["sub"], "name": dev.get("name"), "email": dev.get("email")}
        return {
            i: {"name": known[i].get("name"), "email": known[i].get("email")}
            for i in ids
            if i in known
        }
    out: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=15) as client:
        for sub in ids:
            try:
                res = await _kc(client, "GET", f"/users/{sub}")
            except HTTPException:
                # Keycloak unreachable or lacking view-users: degrade quietly.
                continue
            if res.status_code != 200:
                continue
            u = res.json()
            out[sub] = {"name": _display_name(u), "email": u.get("email")}
    return out
