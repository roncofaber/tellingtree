import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from pydantic import BaseModel
from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from sqlalchemy import or_
from app.models.person import Person
from app.models.relationship import Relationship
from app.models.story import StoryPerson
from app.models.media import Media
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.person import PersonCreate, PersonResponse, PersonUpdate
from app.services.audit import log_action
from app.services.permission import check_tree_access
from app.api.v1.deps import pagination_params

router = APIRouter(prefix="/trees/{tree_id}/persons", tags=["persons"])


@router.get("", response_model=PaginatedResponse[PersonResponse])
def list_persons(
    tree_id: uuid.UUID,
    pagination: dict = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    query = db.query(Person).filter(Person.tree_id == tree_id, Person.deleted_at.is_(None))
    total = query.count()
    items = query.offset(pagination["skip"]).limit(pagination["limit"]).all()
    return PaginatedResponse(
        items=items, total=total, skip=pagination["skip"], limit=pagination["limit"]
    )


@router.post("", response_model=PersonResponse, status_code=201)
def create_person(
    tree_id: uuid.UUID,
    data: PersonCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    person = Person(tree_id=tree_id, **data.model_dump())
    db.add(person)
    db.flush()
    log_action(db, tree_id, current_user.id, "create", "person", person.id,
               {"name": f"{data.given_name or ''} {data.family_name or ''}".strip()})
    db.commit()
    db.refresh(person)
    return person


@router.get("/{person_id}", response_model=PersonResponse)
def get_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    person = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).first()
    if person is None:
        raise NotFoundError("Person not found")
    return person


@router.put("/{person_id}", response_model=PersonResponse)
def update_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    data: PersonUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    person = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).first()
    if person is None:
        raise NotFoundError("Person not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(person, key, value)
    log_action(db, tree_id, current_user.id, "update", "person", person_id,
               {"fields": list(update_data.keys())})
    db.commit()
    db.refresh(person)
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    person = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).first()
    if person is None:
        raise NotFoundError("Person not found")
    person.deleted_at = datetime.now(timezone.utc)
    log_action(db, tree_id, current_user.id, "delete", "person", person_id,
               {"name": f"{person.given_name or ''} {person.family_name or ''}".strip()})
    db.commit()


@router.get("/{person_id}/network", response_model=list[PersonResponse])
def get_person_network(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return all persons reachable from person_id via any chain of relationships (BFS)."""
    check_tree_access(db, tree_id, current_user.id, "viewer")

    visited: set[uuid.UUID] = {person_id}
    frontier: list[uuid.UUID] = [person_id]

    while frontier:
        rels = db.query(Relationship).filter(
            Relationship.tree_id == tree_id,
            or_(
                Relationship.person_a_id.in_(frontier),
                Relationship.person_b_id.in_(frontier),
            ),
        ).all()

        next_frontier: list[uuid.UUID] = []
        for rel in rels:
            for neighbour in (rel.person_a_id, rel.person_b_id):
                if neighbour not in visited:
                    visited.add(neighbour)
                    next_frontier.append(neighbour)

        frontier = next_frontier

    persons = db.query(Person).filter(
        Person.tree_id == tree_id,
        Person.id.in_(visited),
        Person.deleted_at.is_(None),
    ).all()
    return persons


class PersonMergeRequest(BaseModel):
    merge_person_id: uuid.UUID


@router.post("/{person_id}/merge", response_model=PersonResponse)
def merge_persons(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    data: PersonMergeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Merge person B into person A. A keeps combined data, B is soft-deleted."""
    check_tree_access(db, tree_id, current_user.id, "editor")

    keeper = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).first()
    if keeper is None:
        raise NotFoundError("Person not found")

    duplicate = db.query(Person).filter(
        Person.id == data.merge_person_id, Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).first()
    if duplicate is None:
        raise NotFoundError("Person to merge not found")

    if keeper.id == duplicate.id:
        raise BadRequestError("Cannot merge a person with themselves")

    # 1. Merge fields — fill gaps in keeper from duplicate
    text_fields = [
        "given_name", "family_name", "maiden_name", "nickname",
        "birth_date", "birth_date_qualifier", "birth_date_2", "birth_date_original",
        "birth_location", "birth_place_id",
        "death_date", "death_date_qualifier", "death_date_2", "death_date_original",
        "death_location", "death_place_id",
        "gender", "occupation", "education", "profile_picture_id",
    ]
    for field in text_fields:
        if getattr(keeper, field) is None and getattr(duplicate, field) is not None:
            setattr(keeper, field, getattr(duplicate, field))

    # is_living: if either is deceased, mark deceased
    if duplicate.is_living is False:
        keeper.is_living = False
    elif keeper.is_living is None and duplicate.is_living is not None:
        keeper.is_living = duplicate.is_living

    # nationalities: union
    if duplicate.nationalities:
        existing = set(keeper.nationalities or [])
        merged = list(existing | set(duplicate.nationalities))
        if merged:
            keeper.nationalities = merged

    # bio: concatenate if both exist
    if duplicate.bio:
        if keeper.bio:
            keeper.bio = keeper.bio.rstrip() + "\n\n" + duplicate.bio
        else:
            keeper.bio = duplicate.bio

    # 2. Transfer relationships
    rels = db.query(Relationship).filter(
        Relationship.tree_id == tree_id,
        or_(
            Relationship.person_a_id == duplicate.id,
            Relationship.person_b_id == duplicate.id,
        ),
    ).all()

    existing_rel_keys = set()
    keeper_rels = db.query(Relationship).filter(
        Relationship.tree_id == tree_id,
        or_(
            Relationship.person_a_id == keeper.id,
            Relationship.person_b_id == keeper.id,
        ),
    ).all()
    for r in keeper_rels:
        key = (frozenset([r.person_a_id, r.person_b_id]), r.relationship_type)
        existing_rel_keys.add(key)

    for rel in rels:
        new_a = keeper.id if rel.person_a_id == duplicate.id else rel.person_a_id
        new_b = keeper.id if rel.person_b_id == duplicate.id else rel.person_b_id
        if new_a == new_b:
            db.delete(rel)
            continue
        key = (frozenset([new_a, new_b]), rel.relationship_type)
        if key in existing_rel_keys:
            db.delete(rel)
            continue
        rel.person_a_id = new_a
        rel.person_b_id = new_b
        existing_rel_keys.add(key)

    # 3. Transfer story links
    story_links = db.query(StoryPerson).filter(StoryPerson.person_id == duplicate.id).all()
    existing_story_ids = {
        sp.story_id for sp in db.query(StoryPerson).filter(StoryPerson.person_id == keeper.id).all()
    }
    for sp in story_links:
        if sp.story_id in existing_story_ids:
            db.delete(sp)
        else:
            sp.person_id = keeper.id
            existing_story_ids.add(sp.story_id)

    # 4. Transfer media
    db.query(Media).filter(Media.person_id == duplicate.id).update({Media.person_id: keeper.id})

    # 5. Soft-delete duplicate
    duplicate.deleted_at = datetime.now(timezone.utc)

    # 6. Audit
    keeper_name = f"{keeper.given_name or ''} {keeper.family_name or ''}".strip()
    dup_name = f"{duplicate.given_name or ''} {duplicate.family_name or ''}".strip()
    log_action(db, tree_id, current_user.id, "update", "person", keeper.id,
               {"action": "merge", "merged_from": str(duplicate.id), "merged_name": dup_name})

    db.commit()
    db.refresh(keeper)
    return keeper
