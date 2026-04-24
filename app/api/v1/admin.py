import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
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


class AdminStats(BaseModel):
    users_total: int
    users_pending: int
    users_active: int
    users_superadmin: int
    trees_total: int
    trees_public: int
    invites_outstanding: int
    invites_used: int

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])


# ── Stats ──────────────────────────────────────────────────────────────────────


@router.get("/stats", response_model=AdminStats)
def get_admin_stats(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    all_users = db.query(User).all()
    all_trees = db.query(Tree).all()
    all_invites = db.query(RegistrationInvite).all()
    return AdminStats(
        users_total=len(all_users),
        users_pending=sum(1 for u in all_users if not u.is_approved),
        users_active=sum(1 for u in all_users if u.is_approved and not u.is_superadmin),
        users_superadmin=sum(1 for u in all_users if u.is_superadmin),
        trees_total=len(all_trees),
        trees_public=sum(1 for t in all_trees if t.is_public),
        invites_outstanding=sum(1 for i in all_invites if not i.used_at and i.expires_at.replace(tzinfo=timezone.utc) > now),
        invites_used=sum(1 for i in all_invites if i.used_at),
    )


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
        raise BadRequestError("Cannot suspend a superadmin. Demote first.")
    user.is_approved = False
    user.token_version += 1
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id).delete()
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/promote", response_model=UserResponse)
def promote_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Grant superadmin to a user. Also ensures they are approved."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise NotFoundError("User not found")
    if user.is_superadmin:
        raise BadRequestError("User is already a superadmin.")
    user.is_superadmin = True
    user.is_approved = True
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}/demote", response_model=UserResponse)
def demote_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Remove superadmin from a user. Prevents demoting the last superadmin."""
    if user_id == admin.id:
        raise BadRequestError("You cannot demote yourself.")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise NotFoundError("User not found")
    if not user.is_superadmin:
        raise BadRequestError("User is not a superadmin.")
    superadmin_count = db.query(User).filter(User.is_superadmin == True).count()  # noqa: E712
    if superadmin_count <= 1:
        raise BadRequestError("Cannot demote the last superadmin.")
    user.is_superadmin = False
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
        raise BadRequestError("Cannot delete a superadmin. Demote first.")
    owned = db.query(Tree).filter(Tree.owner_id == user.id).first()
    if owned:
        raise BadRequestError(
            f"User owns tree \"{owned.name}\". Transfer or delete it first."
        )
    db.delete(user)
    db.commit()
