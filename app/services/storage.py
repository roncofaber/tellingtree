import uuid
from pathlib import Path

from app.config import settings

ALLOWED_MIME_PREFIXES = ("image/", "audio/", "video/", "application/pdf")
ALLOWED_MIME_TYPES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def is_allowed_mime_type(mime_type: str) -> bool:
    if any(mime_type.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
        return True
    return mime_type in ALLOWED_MIME_TYPES


def get_media_type(mime_type: str) -> str:
    if mime_type.startswith("image/"):
        return "photo"
    if mime_type.startswith("audio/"):
        return "audio"
    if mime_type.startswith("video/"):
        return "video"
    return "document"


def make_relative_path(tree_id: uuid.UUID, media_id: uuid.UUID, extension: str) -> str:
    return f"{tree_id}/{media_id}{extension}"


def resolve_path(relative_path: str) -> Path:
    return Path(settings.storage_path) / relative_path


def save_file(tree_id: uuid.UUID, media_id: uuid.UUID, content: bytes, extension: str) -> str:
    relative = make_relative_path(tree_id, media_id, extension)
    full_path = resolve_path(relative)
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(content)
    return relative


def delete_file(storage_path: str) -> None:
    path = resolve_path(storage_path)
    if path.exists():
        path.unlink()
