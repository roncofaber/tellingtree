"""Notification creation helpers."""

import uuid

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.tree import TreeMember
from app.models.user import User


def notify_tree_members(
    db: Session,
    tree_id: uuid.UUID,
    actor_id: uuid.UUID,
    notification_type: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    message: str,
) -> None:
    """Create a notification for each tree member except the actor."""
    members = db.query(TreeMember).filter(TreeMember.tree_id == tree_id).all()
    for m in members:
        if m.user_id == actor_id:
            continue
        db.add(Notification(
            user_id=m.user_id,
            tree_id=tree_id,
            type=notification_type,
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message,
        ))


def notify_superadmins(
    db: Session,
    notification_type: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    message: str,
    actor_id: uuid.UUID | None = None,
) -> None:
    """Create a notification for all superadmins (system-level, no tree)."""
    superadmins = db.query(User).filter(User.is_superadmin.is_(True)).all()
    for admin in superadmins:
        if actor_id and admin.id == actor_id:
            continue
        db.add(Notification(
            user_id=admin.id,
            tree_id=None,
            type=notification_type,
            actor_id=actor_id,
            entity_type=entity_type,
            entity_id=entity_id,
            message=message,
        ))


def notify_user(
    db: Session,
    user_id: uuid.UUID,
    notification_type: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    message: str,
) -> None:
    """Create a notification for a specific user (system-level, no tree)."""
    db.add(Notification(
        user_id=user_id,
        tree_id=None,
        type=notification_type,
        actor_id=None,
        entity_type=entity_type,
        entity_id=entity_id,
        message=message,
    ))
