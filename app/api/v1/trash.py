import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.person import Person
from app.models.story import Story
from app.models.user import User
from app.schemas.person import PersonResponse
from app.schemas.story import StoryResponse
from app.services.permission import check_tree_access

router = APIRouter(prefix="/trees/{tree_id}/trash", tags=["trash"])


class TrashResponse(BaseModel):
    persons: list[PersonResponse]
    stories: list[StoryResponse]


@router.get("", response_model=TrashResponse)
def list_trash(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    persons = db.query(Person).filter(
        Person.tree_id == tree_id, Person.deleted_at.isnot(None)
    ).order_by(Person.deleted_at.desc()).all()
    stories = db.query(Story).filter(
        Story.tree_id == tree_id, Story.deleted_at.isnot(None)
    ).order_by(Story.deleted_at.desc()).all()
    return TrashResponse(persons=persons, stories=stories)


@router.post("/persons/{person_id}/restore", status_code=204)
def restore_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    person = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id, Person.deleted_at.isnot(None)
    ).first()
    if person is None:
        raise NotFoundError("Person not found in trash")
    person.deleted_at = None
    db.commit()


@router.delete("/persons/{person_id}", status_code=204)
def permanent_delete_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    person = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id, Person.deleted_at.isnot(None)
    ).first()
    if person is None:
        raise NotFoundError("Person not found in trash")
    db.delete(person)
    db.commit()


@router.post("/stories/{story_id}/restore", status_code=204)
def restore_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    story = db.query(Story).filter(
        Story.id == story_id, Story.tree_id == tree_id, Story.deleted_at.isnot(None)
    ).first()
    if story is None:
        raise NotFoundError("Story not found in trash")
    story.deleted_at = None
    db.commit()


@router.delete("/stories/{story_id}", status_code=204)
def permanent_delete_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "admin")
    story = db.query(Story).filter(
        Story.id == story_id, Story.tree_id == tree_id, Story.deleted_at.isnot(None)
    ).first()
    if story is None:
        raise NotFoundError("Story not found in trash")
    db.delete(story)
    db.commit()
