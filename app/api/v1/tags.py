import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import ConflictError, NotFoundError
from app.db.session import get_db
from app.models.tag import Tag
from app.models.user import User
from app.schemas.tag import TagCreate, TagResponse, TagUpdate
from app.services.permission import check_tree_access

router = APIRouter(prefix="/trees/{tree_id}/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
def list_tags(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    return db.query(Tag).filter(Tag.tree_id == tree_id).all()


@router.post("", response_model=TagResponse, status_code=201)
def create_tag(
    tree_id: uuid.UUID,
    data: TagCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    existing = db.query(Tag).filter(
        Tag.tree_id == tree_id, Tag.name == data.name
    ).first()
    if existing:
        raise ConflictError("Tag with this name already exists in this tree")

    tag = Tag(tree_id=tree_id, **data.model_dump())
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(
    tree_id: uuid.UUID,
    tag_id: uuid.UUID,
    data: TagUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.tree_id == tree_id).first()
    if tag is None:
        raise NotFoundError("Tag not found")

    update_data = data.model_dump(exclude_unset=True)
    if "name" in update_data:
        existing = db.query(Tag).filter(
            Tag.tree_id == tree_id, Tag.name == update_data["name"], Tag.id != tag_id
        ).first()
        if existing:
            raise ConflictError("Tag with this name already exists")

    for key, value in update_data.items():
        setattr(tag, key, value)
    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tree_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.tree_id == tree_id).first()
    if tag is None:
        raise NotFoundError("Tag not found")
    db.delete(tag)
    db.commit()
