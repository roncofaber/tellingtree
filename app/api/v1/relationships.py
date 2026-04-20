import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.core.relationship_types import RELATIONSHIP_TYPES, get_inverse
from app.db.session import get_db
from app.models.person import Person
from app.models.relationship import Relationship
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.relationship import RelationshipCreate, RelationshipResponse, RelationshipUpdate
from app.services.permission import check_tree_access
from app.api.v1.deps import pagination_params

router = APIRouter(prefix="/trees/{tree_id}/relationships", tags=["relationships"])

relationship_types_router = APIRouter(tags=["relationships"])


@relationship_types_router.get("/relationship-types")
def list_relationship_types() -> list[dict]:
    return [
        {"key": key, "label": info["label"], "inverse": info["inverse"]}
        for key, info in RELATIONSHIP_TYPES.items()
    ]


def _validate_persons_in_tree(db: Session, tree_id: uuid.UUID, person_a_id: uuid.UUID, person_b_id: uuid.UUID):
    if person_a_id == person_b_id:
        raise BadRequestError("Cannot create a relationship between a person and themselves")
    for pid in (person_a_id, person_b_id):
        p = db.query(Person).filter(Person.id == pid, Person.tree_id == tree_id).first()
        if p is None:
            raise NotFoundError(f"Person {pid} not found in this tree")


@router.get("", response_model=PaginatedResponse[RelationshipResponse])
def list_relationships(
    tree_id: uuid.UUID,
    pagination: dict = Depends(pagination_params),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    query = db.query(Relationship).filter(Relationship.tree_id == tree_id)
    total = query.count()
    items = query.offset(pagination["skip"]).limit(pagination["limit"]).all()
    return PaginatedResponse(
        items=items, total=total, skip=pagination["skip"], limit=pagination["limit"]
    )


@router.post("", response_model=RelationshipResponse, status_code=201)
def create_relationship(
    tree_id: uuid.UUID,
    data: RelationshipCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    _validate_persons_in_tree(db, tree_id, data.person_a_id, data.person_b_id)

    rel = Relationship(tree_id=tree_id, **data.model_dump())
    db.add(rel)
    db.commit()
    db.refresh(rel)

    inverse_type = get_inverse(data.relationship_type)
    if inverse_type:
        already_exists = db.query(Relationship).filter(
            Relationship.tree_id == tree_id,
            Relationship.person_a_id == data.person_b_id,
            Relationship.person_b_id == data.person_a_id,
            Relationship.relationship_type == inverse_type,
        ).first()
        if not already_exists:
            inverse = Relationship(
                tree_id=tree_id,
                person_a_id=data.person_b_id,
                person_b_id=data.person_a_id,
                relationship_type=inverse_type,
                start_date=data.start_date,
                end_date=data.end_date,
                notes=data.notes,
            )
            db.add(inverse)
            db.commit()

    return rel


@router.get("/{relationship_id}", response_model=RelationshipResponse)
def get_relationship(
    tree_id: uuid.UUID,
    relationship_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    rel = db.query(Relationship).filter(
        Relationship.id == relationship_id, Relationship.tree_id == tree_id
    ).first()
    if rel is None:
        raise NotFoundError("Relationship not found")
    return rel


@router.put("/{relationship_id}", response_model=RelationshipResponse)
def update_relationship(
    tree_id: uuid.UUID,
    relationship_id: uuid.UUID,
    data: RelationshipUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    rel = db.query(Relationship).filter(
        Relationship.id == relationship_id, Relationship.tree_id == tree_id
    ).first()
    if rel is None:
        raise NotFoundError("Relationship not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(rel, key, value)
    db.commit()
    db.refresh(rel)
    return rel


@router.delete("/{relationship_id}", status_code=204)
def delete_relationship(
    tree_id: uuid.UUID,
    relationship_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "editor")
    rel = db.query(Relationship).filter(
        Relationship.id == relationship_id, Relationship.tree_id == tree_id
    ).first()
    if rel is None:
        raise NotFoundError("Relationship not found")

    inverse_type = get_inverse(rel.relationship_type)
    if inverse_type:
        inverse = db.query(Relationship).filter(
            Relationship.tree_id == tree_id,
            Relationship.person_a_id == rel.person_b_id,
            Relationship.person_b_id == rel.person_a_id,
            Relationship.relationship_type == inverse_type,
        ).first()
        if inverse:
            db.delete(inverse)

    db.delete(rel)
    db.commit()


# Per-person relationships endpoint
person_relationships_router = APIRouter(
    prefix="/trees/{tree_id}/persons/{person_id}/relationships",
    tags=["relationships"],
)


@person_relationships_router.get("", response_model=list[RelationshipResponse])
def get_person_relationships(
    tree_id: uuid.UUID,
    person_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_tree_access(db, tree_id, current_user.id, "viewer")
    person = db.query(Person).filter(
        Person.id == person_id, Person.tree_id == tree_id
    ).first()
    if person is None:
        raise NotFoundError("Person not found")

    rels = db.query(Relationship).filter(
        Relationship.tree_id == tree_id,
        or_(
            Relationship.person_a_id == person_id,
            Relationship.person_b_id == person_id,
        ),
    ).all()
    return rels
