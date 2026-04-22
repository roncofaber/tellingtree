import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.invite import TreeInvite
from app.models.tree import TreeMember
from app.models.user import User
from app.services.permission import check_tree_access

router = APIRouter(tags=["invites"])


class InviteCreate(BaseModel):
    role: str = Field("viewer", pattern=r"^(viewer|editor|admin)$")
    expires_in_days: int = Field(7, ge=1, le=30)


class InviteResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    role: str
    token: str
    expires_at: datetime
    used_by: uuid.UUID | None = None
    used_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteInfo(BaseModel):
    tree_name: str
    role: str
    expires_at: datetime
    already_member: bool = False


@router.post("/trees/{tree_id}/invites", response_model=InviteResponse, status_code=201)
def create_invite(
    tree_id: uuid.UUID,
    data: InviteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    invite = TreeInvite(
        tree_id=tree_id,
        role=data.role,
        token=secrets.token_urlsafe(32),
        created_by=current_user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=data.expires_in_days),
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)
    return invite


@router.get("/trees/{tree_id}/invites", response_model=list[InviteResponse])
def list_invites(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    invites = db.query(TreeInvite).filter(
        TreeInvite.tree_id == tree_id,
        TreeInvite.used_at.is_(None),
        TreeInvite.expires_at > datetime.now(timezone.utc),
    ).order_by(TreeInvite.created_at.desc()).all()
    return invites


@router.delete("/trees/{tree_id}/invites/{invite_id}", status_code=204)
def revoke_invite(
    tree_id: uuid.UUID,
    invite_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    invite = db.query(TreeInvite).filter(
        TreeInvite.id == invite_id, TreeInvite.tree_id == tree_id
    ).first()
    if not invite:
        raise NotFoundError("Invite not found")
    db.delete(invite)
    db.commit()


@router.get("/invite/{token}", response_model=InviteInfo)
def get_invite_info(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(TreeInvite).filter(TreeInvite.token == token).first()
    if not invite:
        raise NotFoundError("Invite not found or expired")
    if invite.used_at is not None:
        raise BadRequestError("This invite has already been used")
    if invite.expires_at < datetime.now(timezone.utc):
        raise BadRequestError("This invite has expired")

    already = db.query(TreeMember).filter(
        TreeMember.tree_id == invite.tree_id,
        TreeMember.user_id == current_user.id,
    ).first()

    return InviteInfo(
        tree_name=invite.tree.name,
        role=invite.role,
        expires_at=invite.expires_at,
        already_member=already is not None,
    )


@router.post("/invite/{token}/accept", status_code=204)
def accept_invite(
    token: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(TreeInvite).filter(TreeInvite.token == token).first()
    if not invite:
        raise NotFoundError("Invite not found or expired")
    if invite.used_at is not None:
        raise BadRequestError("This invite has already been used")
    if invite.expires_at < datetime.now(timezone.utc):
        raise BadRequestError("This invite has expired")

    existing = db.query(TreeMember).filter(
        TreeMember.tree_id == invite.tree_id,
        TreeMember.user_id == current_user.id,
    ).first()
    if existing:
        raise BadRequestError("You are already a member of this tree")

    db.add(TreeMember(
        tree_id=invite.tree_id,
        user_id=current_user.id,
        role=invite.role,
    ))
    invite.used_by = current_user.id
    invite.used_at = datetime.now(timezone.utc)
    db.commit()
