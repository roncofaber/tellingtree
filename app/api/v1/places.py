import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db
from app.models.person import Person
from app.models.place import Place
from app.models.user import User
from app.schemas.place import PlaceCreate, PlaceResponse, PlaceUpdate
from app.services.geocoding import geocode
from app.services.permission import check_tree_access

router = APIRouter(prefix="/places", tags=["places"])
tree_router = APIRouter(prefix="/trees/{tree_id}/places", tags=["places"])


# ─── Global place endpoints ───────────────────────────────────────────────────

@router.get("/search", response_model=list[PlaceResponse])
def search_places(
    q: str = Query(..., min_length=2),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Search existing places, geocode on cache miss."""
    # 1. Local DB search
    local = (
        db.query(Place)
        .filter(Place.display_name.ilike(f"%{q}%"))
        .limit(6)
        .all()
    )
    if len(local) >= 3:
        return local

    # 2. Geocode via Nominatim for fresh results
    results = geocode(q, limit=6)
    places: list[Place] = list(local)
    seen_ids = {p.id for p in local}

    for r in results:
        existing = db.query(Place).filter(
            Place.display_name == r.display_name
        ).first()
        if existing:
            if existing.id not in seen_ids:
                places.append(existing)
                seen_ids.add(existing.id)
            continue

        place = Place(
            display_name=r.display_name,
            city=r.city,
            region=r.region,
            country=r.country,
            country_code=r.country_code,
            lat=r.lat,
            lon=r.lon,
            geocoder="nominatim",
            geocoded_at=datetime.now(timezone.utc),
        )
        db.add(place)
        db.flush()
        places.append(place)
        seen_ids.add(place.id)

    db.commit()
    for p in places:
        db.refresh(p)
    return places[:6]


@router.post("", response_model=PlaceResponse, status_code=201)
def create_place(
    data: PlaceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    place = Place(**data.model_dump(), geocoder="manual")
    db.add(place)
    db.commit()
    db.refresh(place)
    return place


@router.get("/{place_id}", response_model=PlaceResponse)
def get_place(
    place_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    place = db.get(Place, place_id)
    if not place:
        raise NotFoundError("Place not found")
    return place


@router.put("/{place_id}", response_model=PlaceResponse)
def update_place(
    place_id: uuid.UUID,
    data: PlaceUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    place = db.get(Place, place_id)
    if not place:
        raise NotFoundError("Place not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(place, k, v)
    place.geocoder = "manual"
    db.commit()
    db.refresh(place)
    return place


@router.delete("/{place_id}", status_code=204)
def delete_place(
    place_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    place = db.get(Place, place_id)
    if not place:
        raise NotFoundError("Place not found")
    # Unlink from all persons before deleting
    db.query(Person).filter(Person.birth_place_id == place_id).update(
        {"birth_place_id": None}
    )
    db.query(Person).filter(Person.death_place_id == place_id).update(
        {"death_place_id": None}
    )
    db.delete(place)
    db.commit()


# ─── Per-tree places listing ──────────────────────────────────────────────────

@tree_router.get("", response_model=list[PlaceResponse])
def list_tree_places(
    tree_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all places referenced by persons in this tree."""
    check_tree_access(db, tree_id, current_user.id, "viewer")
    places = (
        db.query(Place)
        .join(
            Person,
            or_(
                Person.birth_place_id == Place.id,
                Person.death_place_id == Place.id,
            ),
        )
        .filter(Person.tree_id == tree_id)
        .distinct()
        .all()
    )
    return places
