import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_admin_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.password_reset import PasswordResetToken
from app.models.refresh_session import RefreshSession
from app.models.registration_invite import RegistrationInvite
from app.models.tree import Tree
from app.models.user import User
from app.schemas.registration_invite import (
    PasswordResetUrlResponse,
    RegistrationInviteCreate,
    RegistrationInviteResponse,
)
from app.schemas.user import UserResponse

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])


# ── Registration invites ────────────────────────────────────────────────────────


@router.post("/registration-invites", response_model=RegistrationInviteResponse, status_code=201)
def create_registration_invite(
    data: RegistrationInviteCreate,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    invite = RegistrationInvite(
        token=secrets.token_urlsafe(32),
        created_by=admin.id,
        email=data.email,
        note=data.note,
        expires_at=datetime.now(timezone.utc) + timedelta(days=data.expires_in_days),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/registration-invites", response_model=list[RegistrationInviteResponse])
def list_registration_invites(db: Session = Depends(get_db)):
    return (
        db.query(RegistrationInvite)
        .order_by(RegistrationInvite.created_at.desc())
        .all()
    )


@router.delete("/registration-invites/{invite_id}", status_code=204)
def revoke_registration_invite(invite_id: uuid.UUID, db: Session = Depends(get_db)):
    invite = db.query(RegistrationInvite).filter(RegistrationInvite.id == invite_id).first()
    if invite is None:
        raise NotFoundError("Invite not found")
    if invite.used_at is not None:
        raise BadRequestError("Cannot revoke an invite that has already been used")
    db.delete(invite)
    db.commit()


# ── User approval ───────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[UserResponse])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.put("/users/{user_id}/approve", response_model=UserResponse)
def approve_user(user_id: uuid.UUID, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise NotFoundError("User not found")
    user.is_approved = True
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/reject", response_model=UserResponse)
def reject_user(user_id: uuid.UUID, db: Session = Depends(get_db)):
    """Set is_approved=false and bump token_version to invalidate any active session."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise NotFoundError("User not found")
    if user.is_superadmin:
        raise BadRequestError("Cannot reject a superadmin. Demote first.")
    user.is_approved = False
    user.token_version += 1
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id).delete()
    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-token", response_model=PasswordResetUrlResponse)
def generate_reset_token(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Generate a password reset link for a user. Admin copies and shares it manually."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise NotFoundError("User not found")

    # Invalidate any existing unused tokens
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
    ).delete()

    token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
    ))
    db.commit()

    from app.config import settings
    return PasswordResetUrlResponse(url=f"{settings.app_url}/reset-password/{token}")


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    if user_id == admin.id:
        raise BadRequestError("Cannot delete your own account from the admin panel. Use Settings.")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise NotFoundError("User not found")
    if user.is_superadmin:
        raise BadRequestError("Cannot delete a superadmin.")
    owned = db.query(Tree).filter(Tree.owner_id == user.id).first()
    if owned:
        raise BadRequestError(
            f"User owns tree \"{owned.name}\". Transfer or delete it first."
        )
    db.delete(user)
    db.commit()
