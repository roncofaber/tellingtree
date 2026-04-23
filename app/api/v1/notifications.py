import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    type: str
    actor_id: uuid.UUID | None
    entity_type: str
    entity_id: uuid.UUID | None
    message: str
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    unread: bool = Query(False),
    limit: int = Query(30, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread:
        query = query.filter(Notification.read_at.is_(None))
    return query.order_by(Notification.created_at.desc()).limit(limit).all()


@router.get("/count")
def unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .count()
    )
    return {"count": count}


@router.post("/{notification_id}/read", status_code=204)
def mark_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(
        Notification.id == notification_id, Notification.user_id == current_user.id
    ).first()
    if n and n.read_at is None:
        n.read_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/read-all", status_code=204)
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.read_at.is_(None)
    ).update({Notification.read_at: datetime.now(timezone.utc)})
    db.commit()
