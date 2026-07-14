"""
Gebruikersbeheer via de Keycloak Admin REST API.

Beheerders (realm-rol 'beheerder') kunnen vanuit de app gebruikers aanmaken,
(de)activeren, verwijderen en wachtwoorden resetten. De backend gebruikt
daarvoor een aparte confidential client met een service account
(realm-management rollen: manage-users, view-users, view-realm — die laatste
is nodig om realm-rollen en hun leden te lezen) en de
client-credentials grant. Nieuwe gebruikers krijgen een tijdelijk wachtwoord
en moeten dat bij de eerste login wijzigen — daarna loggen ze in via de
normale OIDC-flow in auth.py; er verandert niets aan het loginpad.

Environment variables:
    OIDC_ADMIN_CLIENT_ID      — service-account client id (default: findocs-admin)
    OIDC_ADMIN_CLIENT_SECRET  — bijbehorend client secret
    (Keycloak-URL en realm worden afgeleid uit OIDC_DISCOVERY_URL, zie auth.py.)
"""

import asyncio
import os
import re
import secrets
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

import auth

ADMIN_CLIENT_ID = os.environ.get("OIDC_ADMIN_CLIENT_ID", "findocs-admin")
ADMIN_CLIENT_SECRET = os.environ.get("OIDC_ADMIN_CLIENT_SECRET", "dev-admin-secret-change-me")

# http://host/realms/findocs/.well-known/openid-configuration →
#   token: http://host/realms/findocs/protocol/openid-connect/token
#   admin: http://host/admin/realms/findocs
_REALM_URL = auth.OIDC_DISCOVERY_URL.removesuffix("/.well-known/openid-configuration")
_BASE_URL, _, _REALM = _REALM_URL.rpartition("/realms/")
TOKEN_URL = f"{_REALM_URL}/protocol/openid-connect/token"
ADMIN_URL = f"{_BASE_URL}/admin/realms/{_REALM}"

DEFAULT_ROLE = "gebruiker"
ADMIN_ROLE = auth.ADMIN_ROLE

router = APIRouter(
    prefix="/api/admin/users",
    tags=["admin"],
    dependencies=[Depends(auth.require_admin)],
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

# Service-account token, gecachet tot vlak voor expiry.
_token_cache: dict = {"value": None, "expires": 0.0}
_token_lock = asyncio.Lock()


async def _admin_token(client: httpx.AsyncClient) -> str:
    async with _token_lock:
        if _token_cache["value"] and time.monotonic() < _token_cache["expires"] - 10:
            return _token_cache["value"]
        try:
            res = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "client_credentials",
                    "client_id": ADMIN_CLIENT_ID,
                    "client_secret": ADMIN_CLIENT_SECRET,
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Keycloak niet bereikbaar: {exc}") from exc
        if res.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="Kon geen beheer-token ophalen bij Keycloak "
                "(controleer OIDC_ADMIN_CLIENT_ID/SECRET en de service-account rollen)",
            )
        data = res.json()
        _token_cache["value"] = data["access_token"]
        _token_cache["expires"] = time.monotonic() + data.get("expires_in", 60)
        return _token_cache["value"]


async def _kc(client: httpx.AsyncClient, method: str, path: str, **kwargs) -> httpx.Response:
    token = await _admin_token(client)
    try:
        res = await client.request(
            method,
            f"{ADMIN_URL}{path}",
            headers={"Authorization": f"Bearer {token}"},
            **kwargs,
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Keycloak niet bereikbaar: {exc}") from exc
    if res.status_code == 403:
        raise HTTPException(
            status_code=502,
            detail="Service account mist realm-management rollen (manage-users/view-users/view-realm)",
        )
    return res


async def _realm_role(client: httpx.AsyncClient, name: str) -> dict:
    res = await _kc(client, "GET", f"/roles/{name}")
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Realm-rol '{name}' niet gevonden in Keycloak")
    return res.json()


def _temp_password() -> str:
    return secrets.token_urlsafe(9)


async def _set_temp_password(client: httpx.AsyncClient, user_id: str, password: str) -> None:
    res = await _kc(
        client,
        "PUT",
        f"/users/{user_id}/reset-password",
        json={"type": "password", "value": password, "temporary": True},
    )
    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail="Wachtwoord instellen mislukt")


def _guard_not_self(request: Request, user_id: str, actie: str) -> None:
    if auth.current_user(request).get("sub") == user_id:
        raise HTTPException(status_code=400, detail=f"Je kunt jezelf niet {actie}")


class UserCreate(BaseModel):
    firstName: str
    lastName: str
    email: str
    isAdmin: bool = False


class UserUpdate(BaseModel):
    enabled: bool | None = None
    isAdmin: bool | None = None


@router.get("")
async def list_users(request: Request) -> list[dict]:
    async with httpx.AsyncClient(timeout=15) as client:
        res = await _kc(client, "GET", "/users", params={"max": 500})
        if res.status_code != 200:
            raise HTTPException(status_code=502, detail="Gebruikers ophalen mislukt")
        admins_res = await _kc(client, "GET", f"/roles/{ADMIN_ROLE}/users", params={"max": 500})
        admin_ids = {u["id"] for u in admins_res.json()} if admins_res.status_code == 200 else set()
    me_sub = auth.current_user(request).get("sub")
    return [
        {
            "id": u["id"],
            "username": u.get("username"),
            "firstName": u.get("firstName"),
            "lastName": u.get("lastName"),
            "email": u.get("email"),
            "enabled": u.get("enabled", False),
            "isAdmin": u["id"] in admin_ids,
            "isSelf": u["id"] == me_sub,
            "createdTimestamp": u.get("createdTimestamp"),
        }
        for u in res.json()
        # Service accounts zijn techniek, geen mensen — niet tonen.
        if not (u.get("username") or "").startswith("service-account-")
    ]


@router.post("", status_code=201)
async def create_user(body: UserCreate) -> dict:
    email = body.email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Ongeldig e-mailadres")
    async with httpx.AsyncClient(timeout=15) as client:
        res = await _kc(
            client,
            "POST",
            "/users",
            json={
                "username": email,
                "email": email,
                "firstName": body.firstName.strip(),
                "lastName": body.lastName.strip(),
                "enabled": True,
                "emailVerified": True,
            },
        )
        if res.status_code == 409:
            raise HTTPException(status_code=409, detail="Er bestaat al een gebruiker met dit e-mailadres")
        if res.status_code != 201:
            raise HTTPException(status_code=502, detail="Gebruiker aanmaken mislukt")
        # Keycloak geeft het id alleen terug via de Location header.
        user_id = res.headers.get("location", "").rstrip("/").rsplit("/", 1)[-1]
        if not user_id:
            raise HTTPException(status_code=502, detail="Keycloak gaf geen gebruikers-id terug")

        roles = [await _realm_role(client, DEFAULT_ROLE)]
        if body.isAdmin:
            roles.append(await _realm_role(client, ADMIN_ROLE))
        await _kc(client, "POST", f"/users/{user_id}/role-mappings/realm", json=roles)

        password = _temp_password()
        await _set_temp_password(client, user_id, password)
    # Het tijdelijke wachtwoord wordt éénmalig getoond aan de beheerder;
    # Keycloak dwingt bij de eerste login een wachtwoordwijziging af.
    return {"id": user_id, "tempPassword": password}


@router.put("/{user_id}")
async def update_user(user_id: str, body: UserUpdate, request: Request) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        if body.enabled is not None:
            if not body.enabled:
                _guard_not_self(request, user_id, "deactiveren")
            res = await _kc(client, "PUT", f"/users/{user_id}", json={"enabled": body.enabled})
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=502, detail="Gebruiker bijwerken mislukt")
        if body.isAdmin is not None:
            if not body.isAdmin:
                _guard_not_self(request, user_id, "de beheerdersrol afnemen")
            role = await _realm_role(client, ADMIN_ROLE)
            method = "POST" if body.isAdmin else "DELETE"
            res = await _kc(client, method, f"/users/{user_id}/role-mappings/realm", json=[role])
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=502, detail="Rol bijwerken mislukt")
    return {"ok": True}


@router.post("/{user_id}/reset-password")
async def reset_password(user_id: str) -> dict:
    password = _temp_password()
    async with httpx.AsyncClient(timeout=15) as client:
        await _set_temp_password(client, user_id, password)
    return {"tempPassword": password}


@router.delete("/{user_id}", status_code=204)
async def delete_user(user_id: str, request: Request) -> None:
    _guard_not_self(request, user_id, "verwijderen")
    async with httpx.AsyncClient(timeout=15) as client:
        res = await _kc(client, "DELETE", f"/users/{user_id}")
        if res.status_code not in (200, 204):
            raise HTTPException(status_code=502, detail="Gebruiker verwijderen mislukt")
