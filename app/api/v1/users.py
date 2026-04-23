import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.rate_limit import avatar_rate_limiter
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.refresh_session import RefreshSession
from app.models.tree import Tree, TreeMember
from app.models.user import User
from app.schemas.user import AccountDelete, PasswordChange, UserResponse, UserUpdate
from app.services.storage import (
    MAX_AVATAR_SIZE_BYTES,
    avatar_extension_for,
    delete_file,
    is_allowed_avatar_mime_type,
    resolve_path,
    save_avatar,
)

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.put("/me", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if data.email is not None and data.email != current_user.email:
        existing = db.query(User).filter(User.email == data.email).first()
        if existing:
            raise ConflictError("Email already in use")
        current_user.email = data.email

    if data.full_name is not None:
        current_user.full_name = data.full_name

    db.commit()
    db.refresh(current_user)
    return current_user


@router.put("/me/password", status_code=204)
def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise BadRequestError("Current password is incorrect")
    current_user.password_hash = hash_password(data.new_password)
    current_user.token_version += 1
    # Tear down every active session — forces re-login on all devices.
    db.query(RefreshSession).filter(RefreshSession.user_id == current_user.id).delete()
    db.commit()


@router.delete("/me", status_code=204)
def delete_account(
    data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(data.password, current_user.password_hash):
        raise BadRequestError("Incorrect password")

    owned_trees = db.query(Tree).filter(Tree.owner_id == current_user.id).all()
    if owned_trees:
        tree_names = [t.name for t in owned_trees]
        raise BadRequestError(
            f"Transfer ownership of your trees before deleting your account: {', '.join(tree_names)}"
        )

    db.query(TreeMember).filter(TreeMember.user_id == current_user.id).delete()
    if current_user.avatar_path:
        delete_file(current_user.avatar_path)
    db.delete(current_user)
    db.commit()


# ── Avatar ──────────────────────────────────────────────────────────────────────


@router.post("/me/avatar", response_model=UserResponse)
async def upload_my_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_allowed_avatar_mime_type(file.content_type):
        raise BadRequestError("Avatar must be a JPEG, PNG, WebP, or GIF image")

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE_BYTES:
        raise BadRequestError(
            f"Avatar too large. Max size is {MAX_AVATAR_SIZE_BYTES // (1024*1024)} MB"
        )

    # Remove the previous file if extension differs (keeps storage clean)
    if current_user.avatar_path:
        delete_file(current_user.avatar_path)

    extension = avatar_extension_for(file.content_type)
    relative = save_avatar(current_user.id, content, extension)
    current_user.avatar_path = relative
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me/avatar", response_model=UserResponse)
def delete_my_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.avatar_path:
        delete_file(current_user.avatar_path)
        current_user.avatar_path = None
        db.commit()
        db.refresh(current_user)
    return current_user


@router.get("/{user_id}/avatar")
def get_user_avatar(
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    avatar_rate_limiter.check_key(str(current_user.id))
    user = db.query(User).filter(User.id == user_id).first()
    if user is None or not user.avatar_path:
        raise NotFoundError("Avatar not found")

    full_path = resolve_path(user.avatar_path)
    if not full_path.exists():
        raise NotFoundError("Avatar file missing")

    mime = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
    }.get(full_path.suffix.lower(), "application/octet-stream")
    return FileResponse(full_path, media_type=mime)
