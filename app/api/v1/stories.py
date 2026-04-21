import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.person import Person
from app.models.story import Story, StoryPerson, StoryTag
from app.models.tag import Tag
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.story import StoryCreate, StoryResponse, StoryUpdate
from app.services.permission import check_tree_access
from app.api.v1.deps import pagination_params

router = APIRouter(prefix="/trees/{tree_id}/stories", tags=["stories"])


def _story_to_response(story: Story) -> StoryResponse:
    resp = StoryResponse.model_validate(story)
    resp.person_ids = [link.person_id for link in story.person_links]
    resp.tag_ids = [link.tag_id for link in story.tag_links]
    return resp


@router.get("", response_model=PaginatedResponse[StoryResponse])
def list_stories(
    tree_id: uuid.UUID,
    person_id: uuid.UUID | None = Query(None),
    tag_id: uuid.UUID | None = Query(None),
    pagination: dict = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    query = db.query(Story).filter(Story.tree_id == tree_id, Story.deleted_at.is_(None))

    if person_id:
        query = query.join(StoryPerson).filter(StoryPerson.person_id == person_id)
    if tag_id:
        query = query.join(StoryTag).filter(StoryTag.tag_id == tag_id)

    total = query.count()
    items = query.order_by(Story.created_at.desc()).offset(pagination["skip"]).limit(pagination["limit"]).all()
    return PaginatedResponse(
        items=[_story_to_response(s) for s in items],
        total=total,
        skip=pagination["skip"],
        limit=pagination["limit"],
    )


@router.post("", response_model=StoryResponse, status_code=201)
def create_story(
    tree_id: uuid.UUID,
    data: StoryCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")

    story = Story(
        tree_id=tree_id,
        author_id=current_user.id,
        title=data.title,
        content=data.content,
        event_date=data.event_date,
        event_end_date=data.event_end_date,
        event_location=data.event_location,
    )
    db.add(story)
    db.flush()

    for pid in data.person_ids:
        person = db.query(Person).filter(Person.id == pid, Person.tree_id == tree_id).first()
        if person is None:
            raise BadRequestError(f"Person {pid} not found in this tree")
        db.add(StoryPerson(story_id=story.id, person_id=pid))

    for tid in data.tag_ids:
        tag = db.query(Tag).filter(Tag.id == tid, Tag.tree_id == tree_id).first()
        if tag is None:
            raise BadRequestError(f"Tag {tid} not found in this tree")
        db.add(StoryTag(story_id=story.id, tag_id=tid))

    db.commit()
    db.refresh(story)
    return _story_to_response(story)


@router.get("/{story_id}", response_model=StoryResponse)
def get_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    story = db.query(Story).filter(
        Story.id == story_id, Story.tree_id == tree_id, Story.deleted_at.is_(None)
    ).first()
    if story is None:
        raise NotFoundError("Story not found")
    return _story_to_response(story)


@router.put("/{story_id}", response_model=StoryResponse)
def update_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    data: StoryUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    story = db.query(Story).filter(
        Story.id == story_id, Story.tree_id == tree_id, Story.deleted_at.is_(None)
    ).first()
    if story is None:
        raise NotFoundError("Story not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(story, key, value)
    db.commit()
    db.refresh(story)
    return _story_to_response(story)


@router.delete("/{story_id}", status_code=204)
def delete_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    story = db.query(Story).filter(
        Story.id == story_id, Story.tree_id == tree_id, Story.deleted_at.is_(None)
    ).first()
    if story is None:
        raise NotFoundError("Story not found")
    story.deleted_at = datetime.now(timezone.utc)
    db.commit()


# --- Story-Person linking ---


@router.post("/{story_id}/persons/{person_id}", status_code=204)
def link_person_to_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    story = db.query(Story).filter(Story.id == story_id, Story.tree_id == tree_id).first()
    if story is None:
        raise NotFoundError("Story not found")
    person = db.query(Person).filter(Person.id == person_id, Person.tree_id == tree_id).first()
    if person is None:
        raise NotFoundError("Person not found")

    existing = db.query(StoryPerson).filter(
        StoryPerson.story_id == story_id, StoryPerson.person_id == person_id
    ).first()
    if not existing:
        db.add(StoryPerson(story_id=story_id, person_id=person_id))
        db.commit()


@router.delete("/{story_id}/persons/{person_id}", status_code=204)
def unlink_person_from_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    link = db.query(StoryPerson).filter(
        StoryPerson.story_id == story_id, StoryPerson.person_id == person_id
    ).first()
    if link is None:
        raise NotFoundError("Link not found")
    db.delete(link)
    db.commit()


# --- Story-Tag linking ---


@router.post("/{story_id}/tags/{tag_id}", status_code=204)
def tag_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    story = db.query(Story).filter(Story.id == story_id, Story.tree_id == tree_id).first()
    if story is None:
        raise NotFoundError("Story not found")
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.tree_id == tree_id).first()
    if tag is None:
        raise NotFoundError("Tag not found")

    existing = db.query(StoryTag).filter(
        StoryTag.story_id == story_id, StoryTag.tag_id == tag_id
    ).first()
    if not existing:
        db.add(StoryTag(story_id=story_id, tag_id=tag_id))
        db.commit()


@router.delete("/{story_id}/tags/{tag_id}", status_code=204)
def untag_story(
    tree_id: uuid.UUID,
    story_id: uuid.UUID,
    tag_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    link = db.query(StoryTag).filter(
        StoryTag.story_id == story_id, StoryTag.tag_id == tag_id
    ).first()
    if link is None:
        raise NotFoundError("Link not found")
    db.delete(link)
    db.commit()
