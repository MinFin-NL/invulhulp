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
import contextlib
import logging
import os
import uuid

import anyio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from pycrdt import Channel, Doc
from pycrdt.websocket import WebsocketServer, YRoom, exception_logger

import auth
import dossierstore
from docstore import _safe
from dossierstore import ROLE_ORDER

router = APIRouter()
log = logging.getLogger(__name__)

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
        self._closed = False
        self._task: asyncio.Task | None = None
        self._sub = doc.observe(self._on_update)

    @property
    def path(self) -> str:
        return self._path

    def _on_update(self, event) -> None:
        if self._closed:
            return
        self._dirty = True
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(self._debounced_flush())

    async def _debounced_flush(self) -> None:
        await asyncio.sleep(_FLUSH_DEBOUNCE_S)
        await self.flush()

    async def flush(self) -> None:
        if self._closed or not self._dirty:
            return
        self._dirty = False
        data = self.doc.get_update()
        await asyncio.to_thread(_atomic_write, self._path, data)

    def close(self) -> None:
        """Stop persisting this doc (its dossier was deleted).

        Unobserving on the event-loop thread is deliberate: the subscription is
        a pyo3-unsendable object, so letting the GC free it on an arbitrary
        worker thread later is the RuntimeError this module already avoids by
        never auto-cleaning rooms. Any in-flight debounced flush is cancelled so
        it cannot recreate the file we are about to remove.
        """
        self._closed = True
        self._dirty = False
        if self._task is not None and not self._task.done():
            self._task.cancel()
        self._task = None
        try:
            self.doc.unobserve(self._sub)
        except Exception:  # already dropped / API drift — nothing left to do
            pass


_persisters: dict[str, _Persister] = {}


def _load_doc(dossier_id: str) -> Doc:
    """A doc reused from memory if we've served this dossier before, else loaded
    from its on-disk Yjs state, else empty (the first client seeds it)."""
    existing = _persisters.get(dossier_id)
    if existing is not None:
        return existing.doc
    doc = Doc()
    # .g2 = collab state generation. Bumped 2026-07-23 together with the
    # frontend's IndexedDB generation: pre-g2 state holds divergent doc
    # lineages (independent seeds from the broken-transport period) that merge
    # into duplicated/reverted content. Old .ybin files are simply orphaned.
    path = os.path.join(COLLAB_PATH, f"{_safe(dossier_id)}.g2.ybin")
    if os.path.exists(path):
        with open(path, "rb") as f:
            doc.apply_update(f.read())
    _persisters[dossier_id] = _Persister(doc, path)
    return doc


class _PersistentServer(WebsocketServer):
    """WebsocketServer whose rooms carry a durable, restart-surviving doc."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self._get_room_lock = anyio.Lock()

    async def get_room(self, name: str) -> YRoom:
        # Serialized: two clients connecting at the same instant (typical after
        # a redeploy reconnects everyone at once) would otherwise both see the
        # room as not-started and both call room.start(). YRoom.start holds its
        # internal start lock for the room's lifetime, so the second start —
        # and with it the second client's whole serve() — blocks forever: that
        # client gets no messages, times out client-side after 30s, and its
        # collaborators' presence/carets flash and vanish in a reconnect loop.
        async with self._get_room_lock:
            if name not in self.rooms:
                self.rooms[name] = YRoom(
                    ready=self.rooms_ready,
                    exception_handler=self.exception_handler,
                    log=self.log,
                    ydoc=_load_doc(name),
                )
            room = self.rooms[name]
            # Waits until the room is fully started, so the next client through
            # the lock observes room.started and skips straight to serving.
            await self.start_room(room)
        return room

    async def drop_room(self, name: str) -> None:
        """Stop and forget a room (its dossier was deleted).

        Takes the same lock as get_room so a client connecting at that instant
        either gets the old room before it is stopped, or misses it entirely and
        builds a fresh (empty) one — never a half-stopped room.
        """
        async with self._get_room_lock:
            if name in self.rooms:
                await self.delete_room(name=name)


# One server for the whole app; started/stopped by the FastAPI lifespan.
# exception_logger: without a handler, one client's socket dying mid-send
# re-raises out of the room's broadcast, kicking every collaborator in that
# dossier into a reconnect loop.
# auto_clean_rooms=False: a cleaned room becomes garbage still holding pycrdt
# Subscriptions, which are pyo3-unsendable — the GC freeing one on a worker
# thread (e.g. inside asyncio.to_thread) raises RuntimeError in whatever code
# happens to run there. Rooms are small, and _persisters keeps every doc in
# memory for the process lifetime anyway.
ws_server = _PersistentServer(auto_clean_rooms=False, exception_handler=exception_logger)


async def flush_all() -> None:
    """Persist every dossier's latest state — called on shutdown so the last
    edits within the debounce window aren't lost."""
    await asyncio.gather(*(p.flush() for p in _persisters.values()), return_exceptions=True)


async def purge_dossier(dossier_id: str) -> None:
    """Erase a deleted dossier's collaboration state: stop persisting it, drop
    the in-memory doc and room, and remove the .ybin file.

    Without this the CRDT keeps a full copy of every answer of a "deleted"
    dossier — on disk and in memory — and, worse, stays reachable: once the
    dossier record is gone, `_authorize` falls through to its grace path for
    unmigrated dossiers and would let any logged-in user join that room.
    """
    persister = _persisters.pop(dossier_id, None)
    path = persister.path if persister else os.path.join(COLLAB_PATH, f"{_safe(dossier_id)}.g2.ybin")
    if persister is not None:
        persister.close()
    await ws_server.drop_room(dossier_id)

    def _remove() -> None:
        try:
            os.remove(path)
        except OSError:
            pass  # never written (nobody collaborated) or already gone

    await asyncio.to_thread(_remove)


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
        # Never raise on a dead peer: the room broadcasts updates to every
        # client from its own task group, so a single failed send would crash
        # the room (and drop in-flight updates) for all collaborators. The
        # dead client's own recv loop ends its serve() and removes it.
        try:
            await self._ws.send_bytes(message)
        except Exception:
            pass

    async def recv(self) -> bytes:
        return bytes(await self._ws.receive_bytes())


def _authorize(user: dict, dossier_id: str) -> bool:
    """True if this user may edit this dossier."""
    record = dossierstore.load_dossier(dossier_id)
    if record is None:
        # No server record yet (unmigrated/local dossier) — the caller owns it,
        # mirroring resolve_session_access's grace path.
        return True
    role = dossierstore.role_of(record, user.get("sub"), user.get("email"))
    return role is not None and ROLE_ORDER[role] >= ROLE_ORDER["editor"]


# How often an open connection re-checks the dossier grant. A revoked or
# downgraded share must end live editing, not only the next connect.
_ACCESS_RECHECK_S = 30


async def _still_allowed(websocket: WebSocket, dossier_id: str) -> bool:
    if auth.DEV_AUTH_BYPASS:
        return True
    # session_user re-checks the account itself (deleted / disabled) once
    # per SESSION_REVALIDATE_SECONDS; in between it only reads the cookie.
    user = await auth.session_user(websocket)
    if not user:
        return False
    return await asyncio.to_thread(_authorize, user, dossier_id)


async def _watch_access(websocket: WebSocket, dossier_id: str) -> None:
    """Close the socket once the user loses edit access. The client's
    reconnect is then refused at the handshake."""
    while True:
        await asyncio.sleep(_ACCESS_RECHECK_S)
        if not await _still_allowed(websocket, dossier_id):
            with contextlib.suppress(Exception):
                await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return


@router.websocket("/api/collab/{dossier_id}")
async def collab(websocket: WebSocket, dossier_id: str) -> None:
    if not await _still_allowed(websocket, dossier_id):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    watcher = asyncio.create_task(_watch_access(websocket, dossier_id))
    try:
        await ws_server.serve(_StarletteChannel(websocket, dossier_id))
    except WebSocketDisconnect:
        pass
    except Exception:
        # A peer disconnecting mid-send can surface here as an ExceptionGroup;
        # log it instead of bubbling a server error — the client reconnects.
        log.exception("collab session for %s ended abnormally", dossier_id)
    finally:
        watcher.cancel()
