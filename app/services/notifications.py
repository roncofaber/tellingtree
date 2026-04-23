"""Notification creation helpers."""

import uuid

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.tree import TreeMember


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
