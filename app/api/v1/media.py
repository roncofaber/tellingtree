import os
import uuid

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.media import Media
from app.models.user import User
from app.schemas.media import MediaResponse
from app.services.permission import check_tree_access
from app.services.storage import get_media_type, is_allowed_mime_type, resolve_path, save_file

router = APIRouter(prefix="/trees/{tree_id}/media", tags=["media"])


@router.get("", response_model=list[MediaResponse])
def list_media(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    items = db.query(Media).filter(Media.tree_id == tree_id).order_by(Media.created_at.desc()).all()
    return items


@router.post("", response_model=MediaResponse, status_code=201)
async def upload_media(
    tree_id: uuid.UUID,
    file: UploadFile = File(...),
    story_id: uuid.UUID | None = Form(None),
    person_id: uuid.UUID | None = Form(None),
    caption: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")

    if not file.content_type or not is_allowed_mime_type(file.content_type):
        raise BadRequestError(f"File type '{file.content_type}' is not allowed")

    content = await file.read()
    if len(content) > settings.max_upload_size_bytes:
        raise BadRequestError(
            f"File too large. Max size is {settings.max_upload_size_bytes // (1024*1024)} MB"
        )

    media_id = uuid.uuid4()
    extension = os.path.splitext(file.filename or "")[1] or ""
    storage_path = save_file(tree_id, media_id, content, extension)

    media = Media(
        id=media_id,
        tree_id=tree_id,
        story_id=story_id,
        person_id=person_id,
        uploaded_by_id=current_user.id,
        filename=f"{media_id}{extension}",
        original_filename=file.filename or "unknown",
        mime_type=file.content_type,
        size_bytes=len(content),
        storage_path=storage_path,
        media_type=get_media_type(file.content_type),
        caption=caption,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


@router.get("/{media_id}", response_model=MediaResponse)
def get_media(
    tree_id: uuid.UUID,
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    media = db.query(Media).filter(
        Media.id == media_id, Media.tree_id == tree_id
    ).first()
    if media is None:
        raise NotFoundError("Media not found")
    return media


@router.get("/{media_id}/download")
def download_media(
    tree_id: uuid.UUID,
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    media = db.query(Media).filter(
        Media.id == media_id, Media.tree_id == tree_id
    ).first()
    if media is None:
        raise NotFoundError("Media not found")

    full_path = resolve_path(media.storage_path)
    if not full_path.exists():
        raise NotFoundError("File not found on disk")

    return FileResponse(
        path=str(full_path),
        media_type=media.mime_type,
        filename=media.original_filename,
    )


@router.delete("/{media_id}", status_code=204)
def delete_media(
    tree_id: uuid.UUID,
    media_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    media = db.query(Media).filter(
        Media.id == media_id, Media.tree_id == tree_id
    ).first()
    if media is None:
        raise NotFoundError("Media not found")
    db.delete(media)
    db.commit()
