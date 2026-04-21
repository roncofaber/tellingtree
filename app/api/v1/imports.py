import json
import uuid

from fastapi import APIRouter, Depends, File, Request, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db.session import get_db, get_session_factory
from app.models.user import User
from app.schemas.imports import ImportResponse
from app.services.gedcom import import_gedcom, import_gedcom_streaming
from app.services.permission import check_tree_access

router = APIRouter(prefix="/trees/{tree_id}/import", tags=["import"])


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

    db_factory = request.app.state.db_factory if hasattr(request.app.state, "db_factory") else get_session_factory()

    def generate():
        own_db = db_factory()
        try:
            for event in import_gedcom_streaming(own_db, tree_id, content):
                yield json.dumps(event) + "\n"
        finally:
            own_db.close()

    return StreamingResponse(generate(), media_type="application/x-ndjson")
