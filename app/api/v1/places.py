import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.errors import BadRequestError, NotFoundError
from app.db.session import get_db, get_session_factory
from app.models.person import Person
from app.models.place import Place
from app.models.user import User
from app.schemas.place import PlaceCreate, PlaceDetailResponse, PlacePersonRef, PlaceResponse, PlaceUpdate
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
        existing = None
        if r.lat is not None and r.lon is not None:
            existing = db.query(Place).filter(
                Place.lat.isnot(None), Place.lon.isnot(None),
                func.abs(Place.lat - r.lat) < 0.005,
                func.abs(Place.lon - r.lon) < 0.005,
            ).first()
        if existing is None:
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


@tree_router.get("/details", response_model=list[PlaceDetailResponse])
def list_tree_places_details(
    tree_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all places in this tree with associated person info."""
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
    place_ids = [p.id for p in places]
    persons = (
        db.query(Person)
        .filter(
            Person.tree_id == tree_id,
            or_(
                Person.birth_place_id.in_(place_ids),
                Person.death_place_id.in_(place_ids),
            ),
        )
        .all()
    )
    place_persons: dict[uuid.UUID, list[PlacePersonRef]] = {p.id: [] for p in places}
    for person in persons:
        name = " ".join(filter(None, [person.given_name, person.family_name])) or "Unnamed"
        if person.birth_place_id in place_persons:
            place_persons[person.birth_place_id].append(
                PlacePersonRef(id=person.id, name=name, field="birth")
            )
        if person.death_place_id in place_persons:
            place_persons[person.death_place_id].append(
                PlacePersonRef(id=person.id, name=name, field="death")
            )
    return [
        PlaceDetailResponse(**PlaceResponse.model_validate(p).model_dump(), persons=place_persons.get(p.id, []))
        for p in places
    ]


@tree_router.post("/geocode-all")
async def batch_geocode(
    tree_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Geocode all raw locations in a tree. Streams NDJSON progress."""
    check_tree_access(db, tree_id, current_user.id, "editor")

    db_factory = getattr(db, "_factory", None) or get_session_factory()

    def generate():
        own_db = get_session_factory()()
        try:
            persons = own_db.query(Person).filter(Person.tree_id == tree_id).all()
            raw_map: dict[str, dict] = {}
            for p in persons:
                if p.birth_location and not p.birth_place_id:
                    key = p.birth_location
                    if key not in raw_map:
                        raw_map[key] = {"location": key, "field": "birth", "person_ids": []}
                    raw_map[key]["person_ids"].append(p.id)
                if p.death_location and not p.death_place_id:
                    key = f"death:{p.death_location}"
                    if key not in raw_map:
                        raw_map[key] = {"location": p.death_location, "field": "death", "person_ids": []}
                    raw_map[key]["person_ids"].append(p.id)

            items = list(raw_map.values())
            total = len(items)
            linked = 0
            failed = 0

            for i, item in enumerate(items):
                try:
                    results = geocode(item["location"], limit=1)
                    if not results:
                        failed += 1
                        yield json.dumps({"phase": "geocoding", "current": i + 1, "total": total, "location": item["location"], "status": "no_match"}) + "\n"
                        continue

                    r = results[0]
                    existing = None
                    if r.lat is not None and r.lon is not None:
                        existing = own_db.query(Place).filter(
                            Place.lat.isnot(None), Place.lon.isnot(None),
                            func.abs(Place.lat - r.lat) < 0.005,
                            func.abs(Place.lon - r.lon) < 0.005,
                        ).first()
                    if existing is None:
                        existing = own_db.query(Place).filter(Place.display_name == r.display_name).first()

                    if existing:
                        place = existing
                    else:
                        place = Place(
                            display_name=r.display_name, city=r.city, region=r.region,
                            country=r.country, country_code=r.country_code,
                            lat=r.lat, lon=r.lon,
                            geocoder="nominatim", geocoded_at=datetime.now(timezone.utc),
                        )
                        own_db.add(place)
                        own_db.flush()

                    fk = "birth_place_id" if item["field"] == "birth" else "death_place_id"
                    for pid in item["person_ids"]:
                        own_db.query(Person).filter(Person.id == pid).update({fk: place.id})
                    own_db.commit()
                    linked += 1

                    yield json.dumps({"phase": "geocoding", "current": i + 1, "total": total, "location": item["location"], "status": "linked", "display_name": place.display_name}) + "\n"
                except Exception:
                    own_db.rollback()
                    failed += 1
                    yield json.dumps({"phase": "geocoding", "current": i + 1, "total": total, "location": item["location"], "status": "error"}) + "\n"

            yield json.dumps({"phase": "done", "linked": linked, "failed": failed, "total": total}) + "\n"
        finally:
            own_db.close()

    return StreamingResponse(generate(), media_type="application/x-ndjson")
