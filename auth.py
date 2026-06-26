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
"""

import os
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth, OAuthError
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

OIDC_DISCOVERY_URL = os.environ.get(
    "OIDC_DISCOVERY_URL",
    "http://localhost:8081/realms/findocs/.well-known/openid-configuration",
)
# Dev bypass: when started with `python main.py --dev`, skip Keycloak entirely
# and treat every request as a fixed local developer. NEVER enable in production.
DEV_AUTH_BYPASS = os.environ.get("DEV_AUTH_BYPASS", "false").lower() == "true"
DEV_USER = {"sub": "dev", "name": "Ontwikkelaar (dev)", "email": "dev@localhost"}

OIDC_CLIENT_ID = os.environ.get("OIDC_CLIENT_ID", "findocs-bff")
OIDC_CLIENT_SECRET = os.environ.get("OIDC_CLIENT_SECRET", "dev-secret-change-me")
OIDC_REDIRECT_URI = os.environ.get(
    "OIDC_REDIRECT_URI", "http://localhost:8080/api/auth/callback"
)
POST_LOGIN_REDIRECT = os.environ.get("OIDC_POST_LOGIN_REDIRECT", "/")
POST_LOGOUT_REDIRECT = os.environ.get("OIDC_POST_LOGOUT_REDIRECT", "/")

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
    request.session["user"] = {
        "sub": claims.get("sub"),
        "name": claims.get("name") or claims.get("preferred_username"),
        "email": claims.get("email"),
    }
    return RedirectResponse(url=POST_LOGIN_REDIRECT)


@router.get("/me")
async def me(request: Request):
    """Return the logged-in user, or 401. The SPA polls this on startup."""
    if DEV_AUTH_BYPASS:
        return DEV_USER
    user = request.session.get("user")
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


def require_user(request: Request) -> None:
    """Global dependency: let /api/auth/* through, gate everything else.

    Attached to the FastAPI app so every existing endpoint is protected
    without touching each route.
    """
    if DEV_AUTH_BYPASS:
        return
    if request.url.path.startswith("/api/auth"):
        return
    if not request.session.get("user"):
        raise HTTPException(status_code=401, detail="Niet ingelogd")
