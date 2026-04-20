import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.imports import ImportResponse
from app.services.gedcom import import_gedcom
from app.services.permission import check_tree_access

router = APIRouter(prefix="/trees/{tree_id}/import", tags=["import"])


@router.post("/gedcom", response_model=ImportResponse)
async def import_gedcom_endpoint(
    tree_id: uuid.UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    content = await file.read()
    result = import_gedcom(db, tree_id, content)
    return result
