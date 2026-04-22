import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import NotFoundError
from app.db.session import get_db
from sqlalchemy import or_
from app.models.person import Person
from app.models.relationship import Relationship
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
