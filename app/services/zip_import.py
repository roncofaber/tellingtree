"""Streaming ZIP backup restore service."""

import json
import logging
import uuid
import zipfile
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Generator

from sqlalchemy.orm import Session

from app.config import settings
from app.core.errors import BadRequestError
from app.models.media import Media
from app.models.person import Person
from app.models.relationship import Relationship
from app.models.story import Story, StoryPerson, StoryTag
from app.models.tag import Tag
from app.models.tree import Tree, TreeMember
from app.services.permission import make_unique_slug
from app.services.storage import (
    save_file, save_story_content, is_allowed_mime_type, get_media_type,
)

logger = logging.getLogger(__name__)

_MAX_ENTRIES = 50_000
_MAX_UNCOMPRESSED = 10 * 1024 * 1024 * 1024  # 10 GB uncompressed ceiling


def _read_json(zf: zipfile.ZipFile, name: str) -> list | dict:
    try:
        return json.loads(zf.read(name).decode("utf-8"))
    except KeyError:
        raise BadRequestError(f"Invalid backup: missing {name}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise BadRequestError(f"Invalid backup: {name} is not valid JSON")


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except (ValueError, TypeError):
        return None


def _remap(table: dict[str, uuid.UUID], old_id: str | None) -> uuid.UUID | None:
    if not old_id:
        return None
    return table.get(old_id)


def import_zip_streaming(
    db: Session,
    user_id: uuid.UUID,
    zip_path: str,
    tree_name: str | None = None,
) -> Generator[dict, None, None]:

    yield {"phase": "validating"}

    with zipfile.ZipFile(zip_path, "r") as zf:

        # ── Security checks ───────────────────────────────────────────────
        entries = zf.infolist()
        if len(entries) > _MAX_ENTRIES:
            raise BadRequestError(f"ZIP has too many entries ({len(entries):,})")

        total_uncompressed = sum(zi.file_size for zi in entries)
        if total_uncompressed > _MAX_UNCOMPRESSED:
            raise BadRequestError(
                f"ZIP uncompressed size ({total_uncompressed // (1024**3):.1f} GB) exceeds limit"
            )

        for zi in entries:
            if ".." in zi.filename or zi.filename.startswith("/"):
                raise BadRequestError(f"Invalid ZIP entry path: {zi.filename!r}")

        # ── Load JSON metadata ────────────────────────────────────────────
        tree_data    = _read_json(zf, "tree.json")
        persons_data = _read_json(zf, "persons.json")
        rels_data    = _read_json(zf, "relationships.json")
        stories_data = _read_json(zf, "stories.json")
        tags_data    = _read_json(zf, "tags.json")
        media_index  = _read_json(zf, "media_index.json")

        entry_names = {zi.filename for zi in entries}

        # ── Build UUID remap tables ───────────────────────────────────────
        persons_remap:  dict[str, uuid.UUID] = {p["id"]: uuid.uuid4() for p in persons_data}
        stories_remap:  dict[str, uuid.UUID] = {s["id"]: uuid.uuid4() for s in stories_data}
        tags_remap:     dict[str, uuid.UUID] = {t["id"]: uuid.uuid4() for t in tags_data}
        media_remap:    dict[str, uuid.UUID] = {m["id"]: uuid.uuid4() for m in media_index}

        # ── Create tree ───────────────────────────────────────────────────
        name = (tree_name or "").strip() or tree_data.get("name", "Restored Tree")
        slug = make_unique_slug(db, name)
        new_tree = Tree(owner_id=user_id, name=name, slug=slug,
                        description=tree_data.get("description"),
                        is_public=tree_data.get("is_public", False))
        db.add(new_tree)
        db.flush()
        new_tree_id = new_tree.id

        # Add owner as tree member
        db.add(TreeMember(tree_id=new_tree_id, user_id=user_id, role="owner"))

        errors: list[str] = []

        # ── Tags ──────────────────────────────────────────────────────────
        total_tags = len(tags_data)
        for i, t in enumerate(tags_data):
            db.add(Tag(
                id=tags_remap[t["id"]],
                tree_id=new_tree_id,
                name=str(t.get("name", ""))[:100],
                color=t.get("color"),
            ))
            if i % 50 == 0:
                db.commit()
                yield {"phase": "tags", "current": i, "total": total_tags}
        db.commit()
        yield {"phase": "tags", "current": total_tags, "total": total_tags}

        # ── Persons ───────────────────────────────────────────────────────
        # profile_picture_id references media which hasn't been imported yet.
        # Insert persons without it, then patch after media is imported.
        profile_pic_updates: dict[uuid.UUID, uuid.UUID] = {}  # new_person_id → new_media_id

        total_persons = len(persons_data)
        for i, p in enumerate(persons_data):
            new_person_id = persons_remap[p["id"]]
            old_pic_id = p.get("profile_picture_id")
            if old_pic_id and old_pic_id in media_remap:
                profile_pic_updates[new_person_id] = media_remap[old_pic_id]
            db.add(Person(
                id=new_person_id,
                tree_id=new_tree_id,
                given_name=p.get("given_name"),
                family_name=p.get("family_name"),
                maiden_name=p.get("maiden_name"),
                nickname=p.get("nickname"),
                gender=p.get("gender"),
                birth_date=_parse_date(p.get("birth_date")),
                birth_date_qualifier=p.get("birth_date_qualifier"),
                birth_date_2=_parse_date(p.get("birth_date_2")),
                birth_date_original=p.get("birth_date_original"),
                birth_location=p.get("birth_location"),
                death_date=_parse_date(p.get("death_date")),
                death_date_qualifier=p.get("death_date_qualifier"),
                death_date_2=_parse_date(p.get("death_date_2")),
                death_date_original=p.get("death_date_original"),
                death_location=p.get("death_location"),
                is_living=p.get("is_living"),
                occupation=p.get("occupation"),
                nationalities=p.get("nationalities"),
                education=p.get("education"),
                bio=p.get("bio"),
                profile_picture_id=None,  # patched after media import
            ))
            if i % 50 == 0:
                db.commit()
                yield {"phase": "persons", "current": i, "total": total_persons}
        db.commit()
        yield {"phase": "persons", "current": total_persons, "total": total_persons}

        # ── Relationships ─────────────────────────────────────────────────
        total_rels = len(rels_data)
        for i, r in enumerate(rels_data):
            a_id = _remap(persons_remap, r.get("person_a_id"))
            b_id = _remap(persons_remap, r.get("person_b_id"))
            if not a_id or not b_id:
                errors.append(f"Skipping relationship: unknown person IDs")
                continue
            db.add(Relationship(
                tree_id=new_tree_id,
                person_a_id=a_id,
                person_b_id=b_id,
                relationship_type=str(r.get("relationship_type", "other")),
                start_date=_parse_date(r.get("start_date")),
                end_date=_parse_date(r.get("end_date")),
                notes=r.get("notes"),
            ))
            if i % 50 == 0:
                db.commit()
                yield {"phase": "relationships", "current": i, "total": total_rels}
        db.commit()
        yield {"phase": "relationships", "current": total_rels, "total": total_rels}

        # ── Stories + content files ───────────────────────────────────────
        total_stories = len(stories_data)
        for i, s in enumerate(stories_data):
            new_story_id = stories_remap[s["id"]]
            content_path = None
            content_file = s.get("content_file")
            if content_file and content_file in entry_names:
                try:
                    raw = zf.read(content_file).decode("utf-8")
                    json.loads(raw)  # validate it's JSON before saving
                    content_path = save_story_content(new_tree_id, new_story_id, raw)
                except Exception as exc:
                    errors.append(f"Story content invalid for '{s.get('title', s['id'])}': {exc}")

            story = Story(
                id=new_story_id,
                tree_id=new_tree_id,
                author_id=user_id,
                title=str(s.get("title", "Untitled"))[:255],
                content_path=content_path,
                event_date=_parse_date(s.get("event_date")),
                event_end_date=_parse_date(s.get("event_end_date")),
                event_location=s.get("event_location"),
            )
            db.add(story)

            for pid_str in s.get("person_ids", []):
                new_pid = _remap(persons_remap, pid_str)
                if new_pid:
                    db.add(StoryPerson(story_id=new_story_id, person_id=new_pid))

            for tid_str in s.get("tag_ids", []):
                new_tid = _remap(tags_remap, tid_str)
                if new_tid:
                    db.add(StoryTag(story_id=new_story_id, tag_id=new_tid))

            if i % 50 == 0:
                db.commit()
                yield {"phase": "stories", "current": i, "total": total_stories}
        db.commit()
        yield {"phase": "stories", "current": total_stories, "total": total_stories}

        # ── Media (one file at a time from ZIP) ───────────────────────────
        total_media = len(media_index)
        imported = skipped = 0
        limit = settings.max_upload_size_bytes

        for i, m in enumerate(media_index):
            zip_entry = f"media/{m.get('filename_in_zip', '')}"
            orig_name = m.get("original_filename", "unknown")
            mime = m.get("mime_type", "")

            if zip_entry not in entry_names:
                errors.append(f"Media file missing in ZIP: {orig_name}")
                skipped += 1
                continue

            if not is_allowed_mime_type(mime):
                errors.append(f"Disallowed MIME type skipped: {orig_name} ({mime})")
                skipped += 1
                continue

            with zf.open(zip_entry) as src:
                content = src.read(limit + 1)

            if len(content) > limit:
                errors.append(f"Media file too large, skipped: {orig_name}")
                skipped += 1
                continue

            new_media_id = media_remap[m["id"]]
            ext = Path(orig_name).suffix
            storage_path = save_file(new_tree_id, new_media_id, content, ext)

            db.add(Media(
                id=new_media_id,
                tree_id=new_tree_id,
                storage_path=storage_path,
                filename=f"{new_media_id}{ext}",
                original_filename=orig_name,
                mime_type=mime,
                media_type=get_media_type(mime),
                size_bytes=len(content),
                caption=m.get("caption"),
                uploaded_by_id=user_id,
                person_id=_remap(persons_remap, m.get("person_id")),
                story_id=_remap(stories_remap, m.get("story_id")),
            ))
            imported += 1

            if i % 10 == 0:
                db.commit()
                yield {"phase": "media", "current": i, "total": total_media}

        db.commit()
        yield {"phase": "media", "current": total_media, "total": total_media}

        # ── Patch profile_picture_id now that media exists ─────────────────
        for person_id, media_id in profile_pic_updates.items():
            db.query(Person).filter(Person.id == person_id).update(
                {"profile_picture_id": media_id}
            )
        if profile_pic_updates:
            db.commit()

    yield {
        "phase": "done",
        "tree_slug": new_tree.slug,
        "persons_created": total_persons,
        "stories_created": total_stories,
        "media_imported": imported,
        "media_skipped": skipped,
        "errors": errors[:50],
        "warnings": [
            "Geocoded place links were not restored. "
            "Re-geocode from Settings → Places to rebuild map data."
        ] if any(p.get("birth_place_id") or p.get("death_place_id") for p in persons_data) else [],
    }
