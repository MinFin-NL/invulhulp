"""
OIDC Backend-for-Frontend (Keycloak).

The SPA never handles a token. This backend runs the OpenID Connect
Authorization Code flow (with PKCE) against Keycloak and keeps only the user's
identity in a signed, HttpOnly session cookie. See ./keycloak for the IdP.

Environment variables:
    OIDC_DISCOVERY_URL          — Keycloak .well-known/openid-configuration URL
                                  (back-channel reachable from the backend)
    OIDC_CLIENT_ID              — confidential client id (default: findocs-bff)
    OIDC_CLIENT_SECRET          — client secret
    OIDC_REDIRECT_URI           — public callback URL (browser-reachable)
    OIDC_POST_LOGIN_REDIRECT    — where to send the browser after login
    OIDC_POST_LOGOUT_REDIRECT   — where to send the browser after logout
    SESSION_MAX_AGE             — session cookie lifetime in seconds (default: 12 h)
    SESSION_REVALIDATE_SECONDS  — how often a session's account is re-checked
                                  against Keycloak (default: 300)
"""

import logging
import os
import time
from urllib.parse import quote, urlencode

import httpx
from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from starlette.requests import HTTPConnection

OIDC_DISCOVERY_URL = os.environ.get(
    "OIDC_DISCOVERY_URL",
    "http://localhost:8081/realms/findocs/.well-known/openid-configuration",
)
# Dev bypass: when started with `python main.py --dev`, skip Keycloak entirely
# and treat every request as a fixed local developer. NEVER enable in production.
DEV_AUTH_BYPASS = os.environ.get("DEV_AUTH_BYPASS", "false").lower() == "true"
DEV_USER = {
    "sub": "dev",
    "name": "Ontwikkelaar (dev)",
    "email": "dev@localhost",
    "roles": ["gebruiker", "beheerder"],
}

# Rollen die het formulierenaanbod inperken. Wie er géén heeft, ziet alles;
# wie er één heeft, ziet alleen de formulieren die in public/forms/index.json
# onder die rol staan. De frontend doet het filteren (formLoader.ts) — deze set
# bepaalt alleen welke rollen de sessie in mogen en wat gebruikersbeheer
# aanbiedt, zodat de rolnamen op één plek in de backend staan.
SCOPE_ROLES = {"projectmanagement"}

# Realm roles the app kent; andere Keycloak-rollen (offline_access e.d.)
# worden niet in de sessie opgeslagen.
APP_ROLES = {"gebruiker", "beheerder"} | SCOPE_ROLES
ADMIN_ROLE = "beheerder"

OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "findocs-bff")
OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "dev-secret-change-me")
OIDC_REDIRECT_URI = os.environ.get(
    "OIDC_REDIRECT_URI", "http://localhost:8080/api/auth/callback"
)
POST_LOGIN_REDIRECT = os.environ.get("OIDC_POST_LOGIN_REDIRECT", "/")
POST_LOGOUT_REDIRECT = os.environ.get("OIDC_POST_LOGOUT_REDIRECT", "/")

# Identity and roles are captured at login, but the cookie outlives that
# moment. Without a re-check, a deactivated or deleted account — or one that
# lost 'beheerder' — keeps its access until the cookie expires. So the account
# is re-read from Keycloak once per SESSION_REVALIDATE_SECONDS, and the cookie
# itself lasts one working day instead of Starlette's default two weeks.
SESSION_MAX_AGE = int(os.environ.get("SESSION_MAX_AGE", str(12 * 3600)))
SESSION_REVALIDATE_SECONDS = int(os.environ.get("SESSION_REVALIDATE_SECONDS", "300"))

log = logging.getLogger(__name__)

oauth = OAuth()
oauth.register(
    name="keycloak",
    server_metadata_url=OIDC_DISCOVERY_URL,
    client_id=OIDC_CLIENT_ID,
    client_secret=OIDC_CLIENT_SECRET,
    client_kwargs={
        "scope": "openid email profile",
        "code_challenge_method": "S256",  # PKCE, defence in depth
    },
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/login")
async def login(request: Request):
    """Kick off the Authorization Code flow — redirects the browser to Keycloak."""
    if DEV_AUTH_BYPASS:
        return RedirectResponse(url=POST_LOGIN_REDIRECT)
    return await oauth.keycloak.authorize_redirect(request, OIDC_REDIRECT_URI)


@router.get("/callback")
async def callback(request: Request):
    """Keycloak redirects here with a code; exchange it and store identity."""
    try:
        token = await oauth.keycloak.authorize_access_token(request)
    except OAuthError as exc:
        raise HTTPException(status_code=401, detail=f"Authenticatie mislukt: {exc.error}")
    claims = token.get("userinfo") or {}
    # Realm-rollen komen via de "roles" protocol mapper op de findocs-bff
    # client in het ID-token; fallback op de standaard realm_access claim.
    raw_roles = claims.get("roles") or (claims.get("realm_access") or {}).get("roles") or []
    request.session["user"] = {
        "sub": claims.get("sub"),
        "name": claims.get("name") or claims.get("preferred_username"),
        "email": claims.get("email"),
        "roles": sorted(APP_ROLES.intersection(raw_roles)),
    }
    request.session["checked_at"] = time.time()
    return RedirectResponse(url=POST_LOGIN_REDIRECT)


@router.get("/me")
async def me(request: Request):
    """Return the logged-in user, or 401. The SPA polls this on startup."""
    if DEV_AUTH_BYPASS:
        return DEV_USER
    user = await session_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Niet ingelogd")
    return user


@router.get("/logout")
async def logout(request: Request):
    """Clear the local session and end the Keycloak SSO session."""
    request.session.clear()
    if DEV_AUTH_BYPASS:
        return RedirectResponse(url=POST_LOGOUT_REDIRECT)
    metadata = await oauth.keycloak.load_server_metadata()
    end_session = metadata.get("end_session_endpoint")
    if not end_session:
        return RedirectResponse(url=POST_LOGOUT_REDIRECT)
    params = urlencode(
        {
            "client_id": OIDC_CLIENT_ID,
            "post_logout_redirect_uri": POST_LOGOUT_REDIRECT,
        }
    )
    return RedirectResponse(url=f"{end_session}?{params}")


async def _fresh_account(user: dict) -> dict | None:
    """The session user with its roles re-read from Keycloak, or None when the
    account no longer exists or is disabled.

    Keycloak being unreachable (or the service account lacking view-users) is
    no verdict on the user: the session is kept as it is and re-checked at the
    next interval, so a Keycloak hiccup does not log everyone out.
    """
    # Imported here: admin_users imports auth.
    from admin_users import _kc

    sub = user.get("sub")
    if not sub:
        return None
    path = f"/users/{quote(sub, safe='')}"
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await _kc(client, "GET", path)
            if res.status_code == 404:
                return None
            if res.status_code != 200:
                log.warning("sessiecontrole: Keycloak gaf HTTP %s voor %s", res.status_code, sub)
                return user
            if not res.json().get("enabled", False):
                return None
            roles_res = await _kc(client, "GET", f"{path}/role-mappings/realm/composite")
    except HTTPException as exc:
        log.warning("sessiecontrole overgeslagen: %s", exc.detail)
        return user
    if roles_res.status_code != 200:
        log.warning("sessiecontrole: rollen ophalen gaf HTTP %s", roles_res.status_code)
        return user
    names = {r.get("name") for r in roles_res.json()}
    return {**user, "roles": sorted(APP_ROLES.intersection(names))}


async def session_user(conn: HTTPConnection) -> dict | None:
    """The logged-in user, or None. Re-checks the account against Keycloak
    when the last check is older than SESSION_REVALIDATE_SECONDS, refreshes
    the roles in the session, and ends the session of an account that was
    deleted or disabled. (On a WebSocket the refreshed session is not written
    back — there is no response cookie — so it is simply checked again.)"""
    user = conn.session.get("user")
    if not user:
        return None
    now = time.time()
    if now - conn.session.get("checked_at", 0) < SESSION_REVALIDATE_SECONDS:
        return user
    fresh = await _fresh_account(user)
    if fresh is None:
        conn.session.clear()
        return None
    conn.session["user"] = fresh
    conn.session["checked_at"] = now
    return fresh


def current_user(request: Request) -> dict:
    """The logged-in user's claims (sub/name/email). require_user has already
    gated the request, so outside the dev bypass this never returns empty."""
    if DEV_AUTH_BYPASS:
        return DEV_USER
    return request.session.get("user") or {}


async def require_user(conn: HTTPConnection) -> None:
    """Global dependency: let /api/auth/* through, gate everything else.

    Attached to the FastAPI app so every existing endpoint is protected
    without touching each route. Typed as HTTPConnection (the shared base of
    Request and WebSocket) so it resolves for WebSocket routes too — those
    authenticate inside the endpoint (raising HTTPException before a ws accept
    would 500), so we let them through here.
    """
    if DEV_AUTH_BYPASS:
        return
    if conn.scope["type"] == "websocket":
        return
    if conn.url.path.startswith("/api/auth"):
        return
    if not await session_user(conn):
        raise HTTPException(status_code=401, detail="Niet ingelogd")


def require_admin(request: Request) -> None:
    """Route-dependency voor beheer-endpoints: alleen de rol 'beheerder'."""
    if ADMIN_ROLE not in (current_user(request).get("roles") or []):
        raise HTTPException(status_code=403, detail="Geen beheerdersrechten")
