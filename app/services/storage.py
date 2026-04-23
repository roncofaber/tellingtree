import uuid
from pathlib import Path

from app.config import settings

ALLOWED_MIME_TYPES = {
    # Images — explicit allowlist. SVG is intentionally excluded: it can carry
    # inline JavaScript and event handlers, leading to stored XSS when viewed.
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/tiff",
    "image/bmp",

    # Audio
    "audio/mpeg",
    "audio/mp4",
    "audio/aac",
    "audio/wav",
    "audio/ogg",
    "audio/webm",
    "audio/x-m4a",

    # Video
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-msvideo",

    # Documents
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


def is_allowed_mime_type(mime_type: str) -> bool:
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


# ── Avatars ─────────────────────────────────────────────────────────────────────

ALLOWED_AVATAR_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


def is_allowed_avatar_mime_type(mime_type: str | None) -> bool:
    return mime_type in ALLOWED_AVATAR_MIME_TYPES


def avatar_extension_for(mime_type: str) -> str:
    return {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }[mime_type]


def save_avatar(user_id: uuid.UUID, content: bytes, extension: str) -> str:
    relative = f"avatars/{user_id}{extension}"
    full_path = resolve_path(relative)
    full_path.parent.mkdir(parents=True, exist_ok=True)
    full_path.write_bytes(content)
    return relative
