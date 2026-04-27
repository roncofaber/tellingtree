"""GEDCOM 5.5.1 exporter."""

import json
import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.media import Media
from app.models.person import Person
from app.models.relationship import Relationship
from app.models.story import Story, StoryPerson
from app.models.tree import Tree
from app.services.storage import read_story_content


_MONTH_NAMES = {
    1: "JAN", 2: "FEB", 3: "MAR", 4: "APR", 5: "MAY", 6: "JUN",
    7: "JUL", 8: "AUG", 9: "SEP", 10: "OCT", 11: "NOV", 12: "DEC",
}


def _format_date(d: date | None, qualifier: str | None = None, d2: date | None = None) -> str | None:
    if d is None:
        return None
    day = d.day
    month = _MONTH_NAMES.get(d.month, "")
    year = d.year
    if qualifier == "year-only":
        raw = str(year)
    elif day == 1 and qualifier != "exact":
        raw = f"{month} {year}"
    else:
        raw = f"{day} {month} {year}"
    if qualifier == "about":
        return f"ABT {raw}"
    if qualifier == "before":
        return f"BEF {raw}"
    if qualifier == "after":
        return f"AFT {raw}"
    if qualifier == "estimated":
        return f"EST {raw}"
    if qualifier == "calculated":
        return f"CAL {raw}"
    if qualifier == "between" and d2:
        raw2 = f"{d2.day} {_MONTH_NAMES.get(d2.month, '')} {d2.year}"
        return f"BET {raw} AND {raw2}"
    return raw


def _lexical_to_text(content_json: str | None) -> str:
    """Recursively extract plain text from Lexical JSON editor state."""
    if not content_json:
        return ""
    try:
        node = json.loads(content_json)
    except Exception:
        return content_json
    parts: list[str] = []

    def walk(n: object) -> None:
        if isinstance(n, dict):
            if n.get("type") in ("linebreak", "paragraph") and parts:
                parts.append("\n")
            t = n.get("text")
            if t:
                parts.append(str(t))
            for child in n.get("children", []):
                walk(child)
        elif isinstance(n, list):
            for item in n:
                walk(item)

    walk(node)
    return "".join(parts).strip()


def _emit_note_text(level: int, text: str, lines: list[str]) -> None:
    """Emit NOTE + CONT lines for potentially multi-line text."""
    text_lines = text.replace("\r\n", "\n").split("\n")
    for i, line in enumerate(text_lines):
        tag = "NOTE" if i == 0 else "CONT"
        lines.append(f"{level} {tag} {line}")


def export_gedcom(db: Session, tree_id: uuid.UUID) -> str:
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
    media_items = db.query(Media).filter(Media.tree_id == tree_id).all()

    person_ids = {p.id for p in persons}

    # xref maps
    xref_map: dict[uuid.UUID, str] = {p.id: f"@I{i}@" for i, p in enumerate(persons, 1)}
    media_by_id: dict[uuid.UUID, Media] = {m.id: m for m in media_items}

    # Story → linked persons (only persons in this tree)
    story_persons: dict[uuid.UUID, list[uuid.UUID]] = {}
    story_person_rows = (
        db.query(StoryPerson)
        .filter(StoryPerson.story_id.in_([s.id for s in stories]))
        .all()
    )
    for sp in story_person_rows:
        if sp.person_id in person_ids:
            story_persons.setdefault(sp.story_id, []).append(sp.person_id)

    linked_stories = [s for s in stories if s.id in story_persons]
    note_xref_map: dict[uuid.UUID, str] = {s.id: f"@N{i}@" for i, s in enumerate(linked_stories, 1)}

    # person_id → note xrefs
    person_note_xrefs: dict[uuid.UUID, list[str]] = {}
    for s in linked_stories:
        for pid in story_persons[s.id]:
            person_note_xrefs.setdefault(pid, []).append(note_xref_map[s.id])

    # OBJE xrefs for all media
    obje_xref_map: dict[uuid.UUID, str] = {m.id: f"@M{i}@" for i, m in enumerate(media_items, 1)}

    # ── Build families ────────────────────────────────────────────────────────

    families: list[dict] = []
    fam_idx = 1
    couple_seen: set[tuple] = set()
    person_fam_s: dict[uuid.UUID, list[str]] = {}
    person_fam_c: dict[uuid.UUID, list[str]] = {}
    couple_notes: dict[str, str | None] = {}  # fam_xref → notes

    for r in relationships:
        if r.relationship_type not in ("spouse", "partner"):
            continue
        if r.person_a_id not in person_ids or r.person_b_id not in person_ids:
            continue
        key = tuple(sorted([r.person_a_id, r.person_b_id]))
        if key in couple_seen:
            continue
        couple_seen.add(key)

        children_a = {rel.person_b_id for rel in relationships
                      if rel.relationship_type == "parent" and rel.person_a_id == r.person_a_id
                      and rel.person_b_id in person_ids}
        children_b = {rel.person_b_id for rel in relationships
                      if rel.relationship_type == "parent" and rel.person_a_id == r.person_b_id
                      and rel.person_b_id in person_ids}
        shared_children = children_a & children_b

        fam_xref = f"@F{fam_idx}@"
        fam_idx += 1

        pa = next((p for p in persons if p.id == r.person_a_id), None)
        husb_id = r.person_a_id if (pa and pa.gender == "male") else r.person_b_id
        wife_id = r.person_b_id if husb_id == r.person_a_id else r.person_a_id

        families.append({
            "xref": fam_xref,
            "husb": husb_id,
            "wife": wife_id,
            "children": sorted(shared_children, key=lambda c: next(
                (p.birth_date or date.min for p in persons if p.id == c), date.min
            )),
            "start_date": r.start_date,
            "end_date": r.end_date,
            "notes": r.notes,
        })
        person_fam_s.setdefault(husb_id, []).append(fam_xref)
        person_fam_s.setdefault(wife_id, []).append(fam_xref)
        for child_id in shared_children:
            person_fam_c.setdefault(child_id, []).append(fam_xref)

    for r in relationships:
        if r.relationship_type != "parent":
            continue
        if r.person_a_id not in person_ids or r.person_b_id not in person_ids:
            continue
        child_id = r.person_b_id
        parent_id = r.person_a_id
        if child_id in person_fam_c:
            continue
        fam_xref = f"@F{fam_idx}@"
        fam_idx += 1
        parent = next((p for p in persons if p.id == parent_id), None)
        families.append({
            "xref": fam_xref,
            "husb": parent_id if (parent and parent.gender == "male") else None,
            "wife": parent_id if (parent and parent.gender != "male") else None,
            "children": [child_id],
            "start_date": None,
            "end_date": None,
            "notes": r.notes,
        })
        person_fam_s.setdefault(parent_id, []).append(fam_xref)
        person_fam_c.setdefault(child_id, []).append(fam_xref)

    # ── Assemble GEDCOM ───────────────────────────────────────────────────────

    lines: list[str] = []
    today = date.today()
    ged_date = f"{today.day} {_MONTH_NAMES[today.month]} {today.year}"
    tree_name = tree.name if tree else "TellingTree Export"

    # Header
    lines.append("0 HEAD")
    lines.append("1 SOUR TellingTree")
    lines.append("2 VERS 0.1.0")
    lines.append(f"2 NAME {tree_name}")
    lines.append("1 SUBM @SUBM1@")
    lines.append("1 GEDC")
    lines.append("2 VERS 5.5.1")
    lines.append("2 FORM LINEAGE-LINKED")
    lines.append("1 CHAR UTF-8")
    lines.append(f"1 DATE {ged_date}")

    # Submitter
    lines.append("0 @SUBM1@ SUBM")
    lines.append(f"1 NAME {tree_name}")

    # Individuals
    for p in persons:
        xref = xref_map[p.id]
        lines.append(f"0 {xref} INDI")

        # NAME
        surn = (p.family_name or "").upper() if p.family_name else ""
        name_val = f"{p.given_name or ''} /{surn}/"
        lines.append(f"1 NAME {name_val.strip()}")
        if p.given_name:
            lines.append(f"2 GIVN {p.given_name}")
        if p.family_name:
            lines.append(f"2 SURN {p.family_name.upper()}")
        if p.nickname:
            lines.append(f"2 NICK {p.nickname}")
        if p.maiden_name:
            lines.append(f"2 _MARNM {p.maiden_name}")

        # SEX
        sex = "M" if p.gender == "male" else "F" if p.gender == "female" else "U"
        lines.append(f"1 SEX {sex}")

        # BIRT
        if p.birth_date or p.birth_location:
            lines.append("1 BIRT")
            bd = _format_date(p.birth_date, p.birth_date_qualifier, p.birth_date_2)
            if bd:
                lines.append(f"2 DATE {bd}")
            if p.birth_location:
                lines.append(f"2 PLAC {p.birth_location}")

        # DEAT
        if p.death_date or p.death_location or p.is_living is False:
            lines.append("1 DEAT")
            dd = _format_date(p.death_date, p.death_date_qualifier, p.death_date_2)
            if dd:
                lines.append(f"2 DATE {dd}")
            if p.death_location:
                lines.append(f"2 PLAC {p.death_location}")

        # _LIVING
        if p.is_living and not p.death_date:
            lines.append("1 _LIVING Y")

        # OCCU
        if p.occupation:
            lines.append(f"1 OCCU {p.occupation}")

        # EDUC
        if p.education:
            lines.append(f"1 EDUC {p.education}")

        # NATI
        if p.nationalities:
            for nat in p.nationalities:
                lines.append(f"1 NATI {nat}")

        # NOTE (bio)
        if p.bio:
            _emit_note_text(1, p.bio, lines)

        # Profile picture OBJE
        if p.profile_picture_id and p.profile_picture_id in media_by_id:
            m = media_by_id[p.profile_picture_id]
            ext = m.original_filename.rsplit(".", 1)[-1].upper() if "." in m.original_filename else ""
            lines.append("1 OBJE")
            lines.append(f"2 FILE {m.original_filename}")
            if ext:
                lines.append(f"2 FORM {ext}")
            lines.append("2 TYPE PHOTO")

        # Story NOTE xrefs
        for nxref in person_note_xrefs.get(p.id, []):
            lines.append(f"1 NOTE {nxref}")

        # FAMS / FAMC
        for fxref in person_fam_s.get(p.id, []):
            lines.append(f"1 FAMS {fxref}")
        for fxref in person_fam_c.get(p.id, []):
            lines.append(f"1 FAMC {fxref}")

    # Families
    for fam in families:
        lines.append(f"0 {fam['xref']} FAM")
        if fam["husb"]:
            lines.append(f"1 HUSB {xref_map.get(fam['husb'], '')}")
        if fam["wife"]:
            lines.append(f"1 WIFE {xref_map.get(fam['wife'], '')}")
        if fam["start_date"]:
            lines.append("1 MARR")
            md = _format_date(fam["start_date"])
            if md:
                lines.append(f"2 DATE {md}")
        if fam["end_date"]:
            lines.append("1 DIV")
            dd = _format_date(fam["end_date"])
            if dd:
                lines.append(f"2 DATE {dd}")
        if fam.get("notes"):
            _emit_note_text(1, fam["notes"], lines)
        for child_id in fam["children"]:
            lines.append(f"1 CHIL {xref_map.get(child_id, '')}")

    # Level-0 NOTE records (stories)
    for s in linked_stories:
        nxref = note_xref_map[s.id]
        lines.append(f"0 {nxref} NOTE {s.title}")
        if s.event_date:
            lines.append(f"1 CONT Date: {_format_date(s.event_date)}")
        if s.event_location:
            lines.append(f"1 CONT Place: {s.event_location}")
        raw_content = read_story_content(s.content_path) if s.content_path else None
        if raw_content:
            text = _lexical_to_text(raw_content)
            if text:
                lines.append("1 CONT ")
                for line in text.split("\n"):
                    lines.append(f"1 CONT {line}")

    # Level-0 OBJE records (all tree media)
    for m in media_items:
        oxref = obje_xref_map[m.id]
        ext = m.original_filename.rsplit(".", 1)[-1].upper() if "." in m.original_filename else ""
        lines.append(f"0 {oxref} OBJE")
        lines.append(f"1 FILE {m.original_filename}")
        if ext:
            lines.append(f"1 FORM {ext}")
        lines.append(f"1 TYPE {m.media_type.upper()}")
        if m.caption:
            lines.append(f"1 TITL {m.caption}")

    # Trailer
    lines.append("0 TRLR")

    return "\n".join(lines) + "\n"
