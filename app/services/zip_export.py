"""Full tree ZIP backup exporter."""

import io
import json
import logging
import uuid
import zipfile
from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models.media import Media
from app.models.person import Person
from app.models.relationship import Relationship
from app.models.story import Story, StoryPerson, StoryTag
from app.models.tag import Tag
from app.models.tree import Tree
from app.services.gedcom_export import export_gedcom
from app.services.storage import resolve_path, make_story_path

logger = logging.getLogger(__name__)


def _default(obj: object) -> str:
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, uuid.UUID):
        return str(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _dumps(obj: object) -> str:
    return json.dumps(obj, default=_default, ensure_ascii=False, indent=2)


def export_zip(db: Session, tree_id: uuid.UUID) -> bytes:
    tree = db.query(Tree).filter(Tree.id == tree_id).first()
    persons = db.query(Person).filter(
        Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).all()
    relationships = db.query(Relationship).filter(
        Relationship.tree_id == tree_id
    ).all()
    stories = db.query(Story).filter(
        Story.tree_id == tree_id, Story.deleted_at.is_(None)
    ).all()
    tags = db.query(Tag).filter(Tag.tree_id == tree_id).all()
    media_items = db.query(Media).filter(Media.tree_id == tree_id).all()

    story_ids = [s.id for s in stories]
    story_person_rows = db.query(StoryPerson).filter(StoryPerson.story_id.in_(story_ids)).all()
    story_tag_rows = db.query(StoryTag).filter(StoryTag.story_id.in_(story_ids)).all()

    # Build lookup maps
    story_person_ids: dict[uuid.UUID, list[str]] = {}
    for sp in story_person_rows:
        story_person_ids.setdefault(sp.story_id, []).append(str(sp.person_id))

    story_tag_ids: dict[uuid.UUID, list[str]] = {}
    for st in story_tag_rows:
        story_tag_ids.setdefault(st.story_id, []).append(str(st.tag_id))

    # Deduplicate media filenames within the zip
    seen_filenames: set[str] = set()

    def unique_filename(m: Media) -> str:
        name = m.original_filename or f"{m.id}"
        if name not in seen_filenames:
            seen_filenames.add(name)
            return name
        base, _, ext = name.rpartition(".")
        deduped = f"{base}_{str(m.id)[:8]}.{ext}" if ext else f"{name}_{str(m.id)[:8]}"
        seen_filenames.add(deduped)
        return deduped

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:

        # tree.json
        zf.writestr("tree.json", _dumps({
            "id": str(tree.id) if tree else str(tree_id),
            "name": tree.name if tree else "",
            "slug": tree.slug if tree else "",
            "description": tree.description if tree else None,
            "is_public": tree.is_public if tree else False,
            "created_at": tree.created_at if tree else None,
            "updated_at": tree.updated_at if tree else None,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "exporter": "TellingTree 0.1.0",
        }))

        # persons.json
        zf.writestr("persons.json", _dumps([{
            "id": str(p.id),
            "given_name": p.given_name,
            "family_name": p.family_name,
            "maiden_name": p.maiden_name,
            "nickname": p.nickname,
            "gender": p.gender,
            "birth_date": p.birth_date,
            "birth_date_qualifier": p.birth_date_qualifier,
            "birth_date_2": p.birth_date_2,
            "birth_date_original": p.birth_date_original,
            "birth_location": p.birth_location,
            "death_date": p.death_date,
            "death_date_qualifier": p.death_date_qualifier,
            "death_date_2": p.death_date_2,
            "death_date_original": p.death_date_original,
            "death_location": p.death_location,
            "is_living": p.is_living,
            "occupation": p.occupation,
            "nationalities": p.nationalities,
            "education": p.education,
            "bio": p.bio,
            "profile_picture_id": str(p.profile_picture_id) if p.profile_picture_id else None,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
        } for p in persons]))

        # relationships.json
        zf.writestr("relationships.json", _dumps([{
            "id": str(r.id),
            "person_a_id": str(r.person_a_id),
            "person_b_id": str(r.person_b_id),
            "relationship_type": r.relationship_type,
            "start_date": r.start_date,
            "end_date": r.end_date,
            "notes": r.notes,
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        } for r in relationships]))

        # stories.json — index only; content lives in stories/{id}.json files
        zf.writestr("stories.json", _dumps([{
            "id": str(s.id),
            "title": s.title,
            "content_file": f"stories/{s.id}.json" if s.content_path else None,
            "event_date": s.event_date,
            "event_end_date": s.event_end_date,
            "event_location": s.event_location,
            "person_ids": story_person_ids.get(s.id, []),
            "tag_ids": story_tag_ids.get(s.id, []),
            "created_at": s.created_at,
            "updated_at": s.updated_at,
        } for s in stories]))

        # stories/{id}.json — Lexical JSON content files
        for s in stories:
            if s.content_path:
                src = resolve_path(s.content_path)
                if src.exists():
                    zf.write(str(src), f"stories/{s.id}.json")
                else:
                    logger.warning("Story content file missing: %s", s.content_path)

        # tags.json
        zf.writestr("tags.json", _dumps([{
            "id": str(t.id),
            "name": t.name,
            "color": t.color,
            "created_at": t.created_at,
        } for t in tags]))

        # media_index.json (metadata for all media)
        media_filenames: dict[uuid.UUID, str] = {}
        zf.writestr("media_index.json", _dumps([{
            "id": str(m.id),
            "original_filename": m.original_filename,
            "filename_in_zip": unique_filename(m),
            "mime_type": m.mime_type,
            "media_type": m.media_type,
            "size_bytes": m.size_bytes,
            "caption": m.caption,
            "person_id": str(m.person_id) if m.person_id else None,
            "story_id": str(m.story_id) if m.story_id else None,
            "created_at": m.created_at,
        } for m in media_items]))

        # Rebuild deduplicated filenames for writing actual files
        # (unique_filename was already called above; re-read from the index we just built)
        # Re-derive: parse the index we serialised
        seen_filenames.clear()

        def zip_filename(m: Media) -> str:
            name = m.original_filename or f"{m.id}"
            if name not in seen_filenames:
                seen_filenames.add(name)
                return f"media/{name}"
            base, _, ext = name.rpartition(".")
            deduped = f"{base}_{str(m.id)[:8]}.{ext}" if ext else f"{name}_{str(m.id)[:8]}"
            seen_filenames.add(deduped)
            return f"media/{deduped}"

        for m in media_items:
            zname = zip_filename(m)
            try:
                path = resolve_path(m.storage_path)
                if path.exists():
                    zf.write(str(path), zname)
                else:
                    logger.warning("Media file missing on disk: %s", m.storage_path)
            except Exception as exc:
                logger.warning("Skipping media %s: %s", m.id, exc)

        # tree.ged (GEDCOM for portability)
        try:
            ged_content = export_gedcom(db, tree_id)
            zf.writestr("tree.ged", ged_content)
        except Exception as exc:
            logger.warning("GEDCOM generation failed, skipping: %s", exc)

    return buf.getvalue()
