"""
Persistent per-user image store for question attachments.

Image bytes are written verbatim (no re-encoding) as
IMAGES_PATH/{user_sub}/{image_id}.bin with a JSON sidecar
IMAGES_PATH/{user_sub}/{image_id}.json holding the metadata. In production
IMAGES_PATH lives on the same Azure Files volume as the docstore, so
attachments survive container restarts and redeploys.

The sidecar's session_id ties an image to a dossier (enables per-dossier
cleanup); source_doc_id is reserved for images extracted from uploaded
source documents.

All functions are synchronous file I/O; callers wrap them in
asyncio.to_thread().

Environment variables:
    IMAGES_PATH — storage path (default: ./data/images)
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from dotenv import load_dotenv

from docstore import _safe

load_dotenv()

IMAGES_PATH = os.environ.get("IMAGES_PATH", "./data/images")


def _user_dir(user_sub: str) -> str:
    return os.path.join(IMAGES_PATH, _safe(user_sub))


def _paths(user_sub: str, image_id: str) -> tuple[str, str]:
    base = os.path.join(_user_dir(user_sub), _safe(image_id))
    return f"{base}.bin", f"{base}.json"


def save_image(
    user_sub: str,
    session_id: str,
    filename: str,
    mime: str,
    data: bytes,
) -> dict[str, Any]:
    os.makedirs(_user_dir(user_sub), exist_ok=True)
    image_id = uuid.uuid4().hex
    meta = {
        "image_id": image_id,
        "session_id": session_id,
        "filename": filename,
        "mime": mime,
        "size": len(data),
        "source_doc_id": None,
    }
    bin_path, meta_path = _paths(user_sub, image_id)
    tmp = f"{bin_path}.tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, bin_path)  # atomic also on the SMB mount
    tmp = f"{meta_path}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    os.replace(tmp, meta_path)
    return meta


def load_image(user_sub: str, image_id: str) -> tuple[bytes, dict[str, Any]] | None:
    bin_path, meta_path = _paths(user_sub, image_id)
    try:
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        with open(bin_path, "rb") as f:
            data = f.read()
    except (OSError, ValueError, json.JSONDecodeError):
        return None
    return data, meta


def delete_image(user_sub: str, image_id: str) -> bool:
    try:
        bin_path, meta_path = _paths(user_sub, image_id)
    except ValueError:
        return False
    removed = False
    for path in (bin_path, meta_path):
        try:
            os.remove(path)
            removed = True
        except OSError:
            pass
    return removed


def delete_session_images(user_sub: str, session_id: str) -> int:
    """Remove all of the user's images belonging to one dossier."""
    directory = _user_dir(user_sub)
    if not os.path.isdir(directory):
        return 0
    removed = 0
    for entry in os.listdir(directory):
        if not entry.endswith(".json"):
            continue
        try:
            with open(os.path.join(directory, entry), encoding="utf-8") as f:
                meta = json.load(f)
        except (OSError, json.JSONDecodeError):
            continue
        if meta.get("session_id") == session_id and delete_image(user_sub, meta.get("image_id", "")):
            removed += 1
    return removed
