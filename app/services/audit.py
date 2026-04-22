import uuid

from sqlalchemy.orm import Session

from app.models.audit import AuditLog


def log_action(
    db: Session,
    tree_id: uuid.UUID,
    user_id: uuid.UUID | None,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None = None,
    details: dict | None = None,
) -> None:
    db.add(AuditLog(
        tree_id=tree_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    ))
