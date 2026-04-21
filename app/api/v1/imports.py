import json
import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth import get_current_user
from app.core.errors import BadRequestError
from app.db.session import get_db, get_session_factory
from app.models.user import User
from app.schemas.imports import ImportResponse
from app.services.gedcom import import_gedcom, import_gedcom_streaming
from app.services.gedcom_export import export_gedcom
from app.services.permission import check_tree_access

router = APIRouter(prefix="/trees/{tree_id}/import", tags=["import"])
export_router = APIRouter(prefix="/trees/{tree_id}/export", tags=["export"])


@router.post("/gedcom")
async def import_gedcom_endpoint(
    tree_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    content = await file.read()
    if len(content) > settings.max_gedcom_size_bytes:
        raise BadRequestError(f"File too large ({len(content) // (1024*1024)}MB). Maximum is {settings.max_gedcom_size_bytes // (1024*1024)}MB.")

    db_factory = request.app.state.db_factory if hasattr(request.app.state, "db_factory") else get_session_factory()

    def generate():
        own_db = db_factory()
        try:
            for event in import_gedcom_streaming(own_db, tree_id, content):
                yield json.dumps(event) + "\n"
        finally:
            own_db.close()

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@export_router.get("/gedcom")
def export_gedcom_endpoint(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    content = export_gedcom(db, tree_id)
    return StreamingResponse(
        iter([content]),
        media_type="application/x-gedcom",
        headers={"Content-Disposition": f'attachment; filename="tree-{tree_id}.ged"'},
    )
