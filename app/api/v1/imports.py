import json
import os
import re
import tempfile
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.core.auth import get_current_user
from app.core.errors import BadRequestError
from app.db.session import get_db, get_session_factory
from app.models.tree import Tree
from app.models.user import User
from app.schemas.imports import ImportResponse
from app.services.gedcom import import_gedcom, import_gedcom_streaming
from app.services.gedcom_export import export_gedcom
from app.services.permission import check_tree_access
from app.services import zip_export as zip_export_svc
from app.services import zip_import as zip_import_svc

router = APIRouter(prefix="/trees/{tree_id}/import", tags=["import"])
export_router = APIRouter(prefix="/trees/{tree_id}/export", tags=["export"])
import_router = APIRouter(prefix="/import", tags=["import"])


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


def _safe_name(name: str) -> str:
    return re.sub(r"[^\w-]", "", name.replace(" ", "-")).lower() or "tree"


@export_router.get("/gedcom")
def export_gedcom_endpoint(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    tree = db.query(Tree).filter(Tree.id == tree_id).first()
    content = export_gedcom(db, tree_id)
    filename = f"{_safe_name(tree.name if tree else 'tree')}.ged"
    return StreamingResponse(
        iter([content]),
        media_type="application/x-gedcom",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@export_router.get("/zip")
def export_zip_endpoint(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    tree = db.query(Tree).filter(Tree.id == tree_id).first()
    data = zip_export_svc.export_zip(db, tree_id)
    filename = f"{_safe_name(tree.name if tree else 'tree')}-{date.today().isoformat()}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@import_router.post("/zip")
async def import_zip_endpoint(
    request: Request,
    file: UploadFile = File(...),
    tree_name: str | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new tree by restoring from a ZIP backup. Streams NDJSON progress."""
    # Write ZIP to a temp file in 1 MB chunks — avoids loading the whole file into memory
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    try:
        total_bytes = 0
        chunk_size = 1024 * 1024
        with os.fdopen(tmp_fd, "wb") as tmp:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > settings.max_zip_backup_size_bytes:
                    raise BadRequestError(
                        f"ZIP file too large (max {settings.max_zip_backup_size_bytes // (1024**3)} GB)"
                    )
                tmp.write(chunk)
    except BadRequestError:
        os.unlink(tmp_path)
        raise

    db_factory = (
        request.app.state.db_factory
        if hasattr(request.app.state, "db_factory")
        else get_session_factory()
    )

    def generate():
        own_db = db_factory()
        try:
            for event in zip_import_svc.import_zip_streaming(
                own_db, current_user.id, tmp_path, tree_name
            ):
                yield json.dumps(event) + "\n"
        finally:
            own_db.close()
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    return StreamingResponse(generate(), media_type="application/x-ndjson")
