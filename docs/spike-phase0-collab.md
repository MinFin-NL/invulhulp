# Phase 0 spike — collab transport de-risk

**Purpose:** answer one question before committing to option 3 —
**pycrdt-in-FastAPI (one backend) vs. Hocuspocus Node sidecar (second service).**
Test the *riskier, cheaper-if-it-works* option first: Python-native. The
sidecar is known-good; we only fall back to it if pycrdt disappoints.

**Rules:** throwaway branch, no production wiring, one rich-text field, two
browser tabs. Delete after the decision. Its only durable output is the answer.

## What the spike must prove

1. Two tabs typing in the **same** answer merge with no lost keystrokes.
2. The socket authenticates with the **existing Keycloak session cookie** — no
   new auth mechanism.
3. A Yjs update **round-trips to disk** and rehydrates on reconnect/restart.
4. Editor role gates writes; a viewer connects read-only.

If all four hold with acceptable latency/effort → go Python-native. If auth,
persistence, or the y-protocol integration fights back → sidecar.

---

## Backend (throwaway: `backend/spike_collab.py`)

Deps (spike only): `pycrdt`, `pycrdt-websocket`.

```python
"""THROWAWAY Phase 0 spike. Not wired into main.py's global require_user
dependency (that injects Request and breaks WS routes) — mounted as its own
router with WS-native auth instead."""
from fastapi import APIRouter, WebSocket, WebSocketException, status
from pycrdt import Doc
from pycrdt_websocket import ASGIServer, WebsocketServer
from pycrdt_websocket.ystore import FileYStore
import backend.auth as auth

router = APIRouter()

def _ws_user(ws: WebSocket) -> dict | None:
    # SessionMiddleware processes websocket scope, so the same signed cookie
    # that backs request.session is here too. Dev bypass mirrors auth.py.
    if auth.DEV_AUTH_BYPASS:
        return auth.DEV_USER
    return ws.session.get("user")

@router.websocket("/api/spike/collab/{dossier_id}")
async def collab(ws: WebSocket, dossier_id: str):
    user = _ws_user(ws)
    if not user:
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    # SPIKE: real version calls resolve_session_access(min_role="editor").
    # Here: just prove the gate works — reject a hardcoded "viewer@" for the
    # read-only test, accept everyone else as editor.
    if user.get("email") == "viewer@spike":
        raise WebSocketException(code=status.WS_1008_POLICY_VIOLATION)
    await ws.accept()
    # WebsocketServer keeps one in-memory Y.Doc per room and persists updates
    # to a per-dossier file (the Phase 2 persistence bridge, stubbed).
    ...  # drive pycrdt_websocket's serve loop for room=dossier_id
```

Wire it in a **spike-only** `main.py` block (guarded, removed before merge):
`app.include_router(spike_collab.router)`. Because the global
`Depends(auth.require_user)` can't resolve a `Request` on a WS route, either (a)
teach `require_user` to no-op on `scope["type"] == "websocket"`, or (b) mount
the spike on a bare sub-app without the global dep. **Note which fix you needed
— it's a real Phase 2 task, not spike noise.**

Persistence check: point `FileYStore` at
`scratchpad/spike-<dossier>.y`, kill uvicorn mid-edit, restart, confirm the
text is still there.

---

## Frontend (throwaway: `src/spike/SpikeCollab.vue`)

Deps (spike only): `yjs`, `y-websocket`, `@tiptap/extension-collaboration`.
`y-websocket`'s `WebsocketProvider` speaks the same y-protocol pycrdt-websocket
serves.

```vue
<script setup lang="ts">
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'

const ydoc = new Y.Doc()
// cookie rides along automatically (same-origin); vite proxy must forward ws.
const provider = new WebsocketProvider(
  `ws://${location.host}/api/spike/collab`, 'demo-dossier', ydoc,
)
const editor = useEditor({
  extensions: [
    // StarterKit history OFF — Collaboration provides its own undo manager.
    StarterKit.configure({ undoRedo: false }),
    Collaboration.configure({ fragment: ydoc.getXmlFragment('answer:q1') }),
  ],
})
</script>
<template><EditorContent :editor="editor" /></template>
```

`vite.config.ts` dev proxy must forward the WS upgrade
(`ws: true` on the `/api/spike` proxy entry).

Mount `SpikeCollab.vue` on a throwaway route or swap it into `App.vue`
temporarily. Open two tabs, type in both.

---

## Measurements that decide sidecar vs. Python

Record these — they are the deliverable:

| Question | Why it decides |
|---|---|
| Did WS auth via `ws.session` just work, or need surgery? | Python's biggest advantage is one auth story. |
| Effort to make `require_user` WS-safe? | Recurs in Phase 2 regardless. |
| pycrdt-websocket persistence: clean, or hand-rolled? | Drives the Phase 2 bridge estimate. |
| Typing latency two-tab, local? | Both options should feel instant; flag if not. |
| Any y-protocol version mismatch (`y-websocket` ↔ pycrdt)? | Protocol drift is the classic Python-side pain. |

## Exit

Write one paragraph in `docs/realtime-collab-plan.md` under Phase 2:
**"Transport decision: <sidecar|python> because <the measurements>."**
Then delete `spike_collab.py`, `SpikeCollab.vue`, and the spike deps.
