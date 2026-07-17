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

import httpx
from fastapi import APIRouter, Request

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
    me_sub = auth.current_user(request).get("sub")
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
            "name": f"{u.get('firstName') or ''} {u.get('lastName') or ''}".strip()
            or u.get("username"),
            "email": u.get("email"),
        }
        for u in res.json()
        if not (u.get("username") or "").startswith("service-account-") and u["id"] != me_sub
    ]
