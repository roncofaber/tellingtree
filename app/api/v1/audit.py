import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.audit import AuditLog
from app.models.user import User
from app.services.permission import check_tree_access

router = APIRouter(prefix="/trees/{tree_id}/audit", tags=["audit"])


class AuditLogResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    user_id: uuid.UUID | None
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    details: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    tree_id: uuid.UUID,
    limit: int = Query(50, le=200),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.tree_id == tree_id)
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return logs
