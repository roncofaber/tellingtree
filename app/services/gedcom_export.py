"""GEDCOM 5.5.1 exporter."""

import uuid
from datetime import date

from sqlalchemy.orm import Session

from app.models.person import Person
from app.models.relationship import Relationship


_MONTH_NAMES = {
    1: "JAN", 2: "FEB", 3: "MAR", 4: "APR", 5: "MAY", 6: "JUN",
    7: "JUL", 8: "AUG", 9: "SEP", 10: "OCT", 11: "NOV", 12: "DEC",
}


def _format_date(d: date | None, qualifier: str | None = None) -> str | None:
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
    return raw


def _ged_line(level: int, tag: str, value: str | None = None) -> str:
    if value:
        return f"{level} {tag} {value}"
    return f"{level} {tag}"


def export_gedcom(db: Session, tree_id: uuid.UUID) -> str:
    persons = db.query(Person).filter(
        Person.tree_id == tree_id, Person.deleted_at.is_(None)
    ).all()
    relationships = db.query(Relationship).filter(
        Relationship.tree_id == tree_id
    ).all()

    person_ids = {p.id for p in persons}
    xref_map: dict[uuid.UUID, str] = {}
    for i, p in enumerate(persons, 1):
        xref_map[p.id] = f"@I{i}@"

    # Build families: group by couple (spouse/partner relationships)
    families: list[dict] = []
    fam_idx = 1
    couple_seen: set[tuple] = set()
    person_fam_s: dict[uuid.UUID, list[str]] = {}  # person → FAMS xrefs
    person_fam_c: dict[uuid.UUID, list[str]] = {}  # person → FAMC xrefs

    # First, identify couples
    for r in relationships:
        if r.relationship_type not in ("spouse", "partner"):
            continue
        if r.person_a_id not in person_ids or r.person_b_id not in person_ids:
            continue
        key = tuple(sorted([r.person_a_id, r.person_b_id]))
        if key in couple_seen:
            continue
        couple_seen.add(key)

        # Find children of this couple
        children_a = {rel.person_b_id for rel in relationships
                      if rel.relationship_type == "parent" and rel.person_a_id == r.person_a_id
                      and rel.person_b_id in person_ids}
        children_b = {rel.person_b_id for rel in relationships
                      if rel.relationship_type == "parent" and rel.person_a_id == r.person_b_id
                      and rel.person_b_id in person_ids}
        shared_children = children_a & children_b

        fam_xref = f"@F{fam_idx}@"
        fam_idx += 1

        # Determine HUSB/WIFE by gender
        pa = next((p for p in persons if p.id == r.person_a_id), None)
        pb = next((p for p in persons if p.id == r.person_b_id), None)
        husb_id = r.person_a_id if (pa and pa.gender == "male") else r.person_b_id
        wife_id = r.person_b_id if husb_id == r.person_a_id else r.person_a_id

        families.append({
            "xref": fam_xref,
            "husb": husb_id,
            "wife": wife_id,
            "children": sorted(shared_children, key=lambda c: next((p.birth_date or date.min for p in persons if p.id == c), date.min)),
            "start_date": r.start_date,
            "end_date": r.end_date,
        })

        person_fam_s.setdefault(husb_id, []).append(fam_xref)
        person_fam_s.setdefault(wife_id, []).append(fam_xref)
        for child_id in shared_children:
            person_fam_c.setdefault(child_id, []).append(fam_xref)

    # Also create families for single parents with children
    for r in relationships:
        if r.relationship_type != "parent":
            continue
        if r.person_a_id not in person_ids or r.person_b_id not in person_ids:
            continue
        child_id = r.person_b_id
        parent_id = r.person_a_id
        if child_id in person_fam_c:
            continue  # already assigned to a couple family
        # Single parent family
        fam_xref = f"@F{fam_idx}@"
        fam_idx += 1
        parent = next((p for p in persons if p.id == parent_id), None)
        fam = {
            "xref": fam_xref,
            "husb": parent_id if (parent and parent.gender == "male") else None,
            "wife": parent_id if (parent and parent.gender != "male") else None,
            "children": [child_id],
            "start_date": None,
            "end_date": None,
        }
        families.append(fam)
        person_fam_s.setdefault(parent_id, []).append(fam_xref)
        person_fam_c.setdefault(child_id, []).append(fam_xref)

    # Build GEDCOM lines
    lines: list[str] = []

    # Header
    lines.append("0 HEAD")
    lines.append("1 SOUR TellingTree")
    lines.append("2 VERS 1.0")
    lines.append("1 GEDC")
    lines.append("2 VERS 5.5.1")
    lines.append("2 FORM LINEAGE-LINKED")
    lines.append("1 CHAR UTF-8")

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

        # SEX
        sex = "M" if p.gender == "male" else "F" if p.gender == "female" else "U"
        lines.append(f"1 SEX {sex}")

        # BIRT
        if p.birth_date or p.birth_location:
            lines.append("1 BIRT")
            bd = _format_date(p.birth_date, p.birth_date_qualifier)
            if bd:
                lines.append(f"2 DATE {bd}")
            if p.birth_location:
                lines.append(f"2 PLAC {p.birth_location}")

        # DEAT
        if p.death_date or p.death_location or p.is_living is False:
            lines.append("1 DEAT")
            dd = _format_date(p.death_date, p.death_date_qualifier)
            if dd:
                lines.append(f"2 DATE {dd}")
            if p.death_location:
                lines.append(f"2 PLAC {p.death_location}")

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
            first_line, *rest = p.bio.split("\n")
            lines.append(f"1 NOTE {first_line}")
            for cont in rest:
                lines.append(f"2 CONT {cont}")

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
        for child_id in fam["children"]:
            lines.append(f"1 CHIL {xref_map.get(child_id, '')}")

    # Trailer
    lines.append("0 TRLR")

    return "\n".join(lines) + "\n"
