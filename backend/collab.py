"""
Real-time collaboration transport (Phase 2 of the collab plan).

A WebSocket endpoint that syncs a Yjs document per dossier between clients,
using pycrdt's y-protocol server (compatible with the frontend's y-websocket
provider). One room per dossier id.

Design:
  - Auth reuses the same signed Keycloak session cookie: SessionMiddleware
    processes the WebSocket scope, so `websocket.session` carries the user.
  - Access is gated to editor/owner on the dossier (viewers read the snapshot
    via the REST load path; live editing is editor+).
  - The server is transport + merge only; it does NOT understand the dossier
    structure. The first client seeds the room from its DossierDoc (built from
    the stored JSON via the TS codec); durable persistence stays with the JSON
    store (schedulePush), which the frontend keeps current from the CRDT mirror.
"""
from __future__ import annotations

import asyncio
import os
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pycrdt import Channel, Doc
from pycrdt.websocket import WebsocketServer, YRoom

import auth
import dossierstore
from docstore import _safe
from dossierstore import ROLE_ORDER

router = APIRouter()

# Durable Yjs state lives here: one binary file per dossier holding the full
# document update. The JSON store (dossierstore) remains the human-readable /
# export source; this is the CRDT state so a server restart preserves in-flight
# collaboration that hadn't yet been snapshotted to JSON.
COLLAB_PATH = os.environ.get("COLLAB_PATH", "./data/collab")
_FLUSH_DEBOUNCE_S = 1.5


def _atomic_write(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{uuid.uuid4().hex}.tmp"
    try:
        with open(tmp, "wb") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise


class _Persister:
    """Keeps one dossier's Yjs doc durably on disk. Observes the doc and, after
    a short debounce, writes its full state so a restart can reload it. Held for
    the server's lifetime (across room auto-clean) so the in-memory doc stays the
    source of truth between opens and only the file crosses restarts."""

    def __init__(self, doc: Doc, path: str) -> None:
        self.doc = doc
        self._path = path
        self._dirty = False
        self._task: asyncio.Task | None = None
        self._sub = doc.observe(self._on_update)

    def _on_update(self, event) -> None:
        self._dirty = True
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(self._debounced_flush())

    async def _debounced_flush(self) -> None:
        await asyncio.sleep(_FLUSH_DEBOUNCE_S)
        await self.flush()

    async def flush(self) -> None:
        if not self._dirty:
            return
        self._dirty = False
        data = self.doc.get_update()
        await asyncio.to_thread(_atomic_write, self._path, data)


_persisters: dict[str, _Persister] = {}


def _load_doc(dossier_id: str) -> Doc:
    """A doc reused from memory if we've served this dossier before, else loaded
    from its on-disk Yjs state, else empty (the first client seeds it)."""
    existing = _persisters.get(dossier_id)
    if existing is not None:
        return existing.doc
    doc = Doc()
    path = os.path.join(COLLAB_PATH, f"{_safe(dossier_id)}.ybin")
    if os.path.exists(path):
        with open(path, "rb") as f:
            doc.apply_update(f.read())
    _persisters[dossier_id] = _Persister(doc, path)
    return doc


class _PersistentServer(WebsocketServer):
    """WebsocketServer whose rooms carry a durable, restart-surviving doc."""

    async def get_room(self, name: str) -> YRoom:
        if name not in self.rooms:
            self.rooms[name] = YRoom(
                ready=self.rooms_ready,
                exception_handler=self.exception_handler,
                log=self.log,
                ydoc=_load_doc(name),
            )
        room = self.rooms[name]
        await self.start_room(room)
        return room


# One server for the whole app; started/stopped by the FastAPI lifespan.
ws_server = _PersistentServer(auto_clean_rooms=True)


async def flush_all() -> None:
    """Persist every dossier's latest state — called on shutdown so the last
    edits within the debounce window aren't lost."""
    await asyncio.gather(*(p.flush() for p in _persisters.values()), return_exceptions=True)


class _StarletteChannel(Channel):
    """Adapts a Starlette/FastAPI WebSocket to pycrdt's Channel protocol.
    `path` is the room name — we pin it to the dossier id."""

    def __init__(self, websocket: WebSocket, room: str) -> None:
        self._ws = websocket
        self._room = room

    @property
    def path(self) -> str:
        return self._room

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        try:
            return await self.recv()
        except Exception:
            raise StopAsyncIteration

    async def send(self, message: bytes) -> None:
        await self._ws.send_bytes(message)

    async def recv(self) -> bytes:
        return bytes(await self._ws.receive_bytes())


def _authorize(websocket: WebSocket, dossier_id: str) -> bool:
    """True if the connecting user may edit this dossier. Runs before accept."""
    if auth.DEV_AUTH_BYPASS:
        return True
    user = websocket.session.get("user")
    if not user:
        return False
    record = dossierstore.load_dossier(dossier_id)
    if record is None:
        # No server record yet (unmigrated/local dossier) — the caller owns it,
        # mirroring resolve_session_access's grace path.
        return True
    role = dossierstore.role_of(record, user.get("sub"), user.get("email"))
    return role is not None and ROLE_ORDER[role] >= ROLE_ORDER["editor"]


@router.websocket("/api/collab/{dossier_id}")
async def collab(websocket: WebSocket, dossier_id: str) -> None:
    allowed = await asyncio.to_thread(_authorize, websocket, dossier_id)
    if not allowed:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    try:
        await ws_server.serve(_StarletteChannel(websocket, dossier_id))
    except WebSocketDisconnect:
        pass
