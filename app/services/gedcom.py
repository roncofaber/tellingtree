"""GEDCOM 5.5.1 importer using ged4py."""

import io
import os
import tempfile
import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

from app.models.person import Person
from app.models.relationship import Relationship


# ─── Result ──────────────────────────────────────────────────────────────────

@dataclass
class ImportResult:
    persons_created: int = 0
    relationships_created: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


# ─── Date parsing ─────────────────────────────────────────────────────────────

_MONTH_MAP = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}


def _calendar_to_date(cal) -> date | None:
    """Convert a ged4py CalendarDate to a Python date. Month/day default to 1."""
    if cal is None:
        return None
    try:
        y = int(cal.year)
        # ged4py months are string abbreviations ("MAY") or 0/None when absent
        raw_m = cal.month
        if not raw_m:
            m = 0
        elif isinstance(raw_m, int):
            m = raw_m
        else:
            m = _MONTH_MAP.get(str(raw_m).upper(), 0)
        raw_d = cal.day
        d = int(raw_d) if raw_d else 0
        return date(y, m or 1, d or 1)
    except Exception:
        return None


def _parse_date(dv) -> tuple[date | None, str | None, date | None, str | None]:
    """
    Parse a ged4py DateValue into (date1, qualifier, date2, original_string).
    date2 is only set for 'between' ranges.
    """
    if dv is None:
        return None, None, None, None

    original = str(dv) if dv is not None else None

    try:
        from ged4py.date import (
            DateValueSimple, DateValueAbout, DateValueBefore, DateValueAfter,
            DateValueRange, DateValuePeriod,
            DateValueEstimated, DateValueCalculated, DateValuePhrase,
        )

        if isinstance(dv, DateValuePhrase):
            return None, None, None, dv.phrase

        if isinstance(dv, DateValueSimple):
            cal = dv.date
            d1 = _calendar_to_date(cal)
            has_month = bool(cal and cal.month)
            qual = "year-only" if not has_month else "exact"
            return d1, qual, None, original

        if isinstance(dv, DateValueAbout):
            return _calendar_to_date(dv.date), "about", None, original

        if isinstance(dv, DateValueBefore):
            return _calendar_to_date(dv.date), "before", None, original

        if isinstance(dv, DateValueAfter):
            return _calendar_to_date(dv.date), "after", None, original

        if isinstance(dv, DateValueEstimated):
            return _calendar_to_date(dv.date), "estimated", None, original

        if isinstance(dv, DateValueCalculated):
            return _calendar_to_date(dv.date), "calculated", None, original

        if isinstance(dv, (DateValueRange, DateValuePeriod)):
            return _calendar_to_date(dv.date1), "between", _calendar_to_date(dv.date2), original

    except Exception:
        pass

    return None, None, None, original


def _get_date_value(record):
    """Extract DateValue from a DATE sub-record."""
    if record is None:
        return None
    date_rec = record.sub_tag("DATE")
    if date_rec is None:
        return None
    return date_rec.value


def _parse_location(plac: str | None) -> str | None:
    return plac.strip() if plac else None


def _normalize_xref(xref: str | None) -> str | None:
    """Strip @ signs from xref IDs like @I1@."""
    if not xref:
        return None
    return xref.strip("@").strip()


# ─── Main importer ────────────────────────────────────────────────────────────

def import_gedcom(db: Session, tree_id: uuid.UUID, content: bytes) -> ImportResult:
    from ged4py.parser import GedcomReader

    result = ImportResult()

    # ged4py requires a file path, so write to a temp file
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".ged")
    try:
        os.write(tmp_fd, content)
        os.close(tmp_fd)

        with GedcomReader(tmp_path) as reader:
            xref_to_person_id = _import_individuals(db, tree_id, reader, result)
            _import_families(db, tree_id, reader, xref_to_person_id, result)

    except Exception as e:
        result.errors.append(f"Fatal parse error: {e}")
    finally:
        os.unlink(tmp_path)

    return result


# ─── Individual import ────────────────────────────────────────────────────────

def _import_individuals(
    db: Session,
    tree_id: uuid.UUID,
    reader,
    result: ImportResult,
) -> dict[str, uuid.UUID]:
    """Create Person records for each INDI. Returns xref → person_id map."""
    xref_map: dict[str, uuid.UUID] = {}

    for indi in reader.records0("INDI"):
        try:
            person = _build_person(indi, tree_id)
            db.add(person)
            db.flush()  # get the ID without committing
            xref_key = _normalize_xref(indi.xref_id)
            if xref_key:
                xref_map[xref_key] = person.id
            result.persons_created += 1
        except Exception as e:
            result.errors.append(f"INDI {indi.xref_id}: {e}")
            result.skipped += 1

    db.commit()
    return xref_map


def _build_person(indi, tree_id: uuid.UUID) -> Person:
    given_name = None
    family_name = None
    maiden_name = None

    name_rec = indi.sub_tag("NAME")
    if name_rec:
        given_name = name_rec.sub_tag_value("GIVN") or None
        raw_surn = name_rec.sub_tag_value("SURN")
        if raw_surn:
            family_name = raw_surn.strip("/").strip() or None
        # Maiden name: Heredis uses _MARNM or _MARN
        maiden_name = (
            name_rec.sub_tag_value("_MARNM")
            or name_rec.sub_tag_value("_MARN")
            or indi.sub_tag_value("_MARNM")
            or indi.sub_tag_value("_MARN")
            or None
        )
        # Fallback: parse NAME value "Adelio Giovanni/RONCORONI/"
        if not given_name and not family_name and name_rec.value:
            raw = str(name_rec.value)
            parts = raw.split("/")
            given_name = parts[0].strip() or None
            if len(parts) >= 2:
                family_name = parts[1].strip() or None

    # Sex
    sex_val = indi.sub_tag_value("SEX")
    gender = {"M": "male", "F": "female"}.get(sex_val or "", None)

    # Birth
    birt = indi.sub_tag("BIRT")
    b_date1, b_qual, b_date2, b_orig = _parse_date(_get_date_value(birt))
    b_loc = _parse_location(birt.sub_tag_value("PLAC") if birt else None)

    # Death
    deat = indi.sub_tag("DEAT")
    d_date1, d_qual, d_date2, d_orig = _parse_date(_get_date_value(deat))
    d_loc = _parse_location(deat.sub_tag_value("PLAC") if deat else None)
    is_living = False if deat else None

    # Occupation (first occurrence)
    occupation = indi.sub_tag_value("OCCU") or None

    # Education (first occurrence)
    education = indi.sub_tag_value("EDUC") or None

    # Nationalities (all occurrences)
    nationalities = [
        r.value for r in indi.sub_tags("NATI") if r.value
    ] or None

    # Bio from NOTE (concatenate multiple notes)
    notes = []
    for note_rec in indi.sub_tags("NOTE"):
        val = note_rec.value
        if val and not str(val).startswith("@"):  # skip xref notes
            notes.append(str(val).strip())
    bio = "\n\n".join(notes) or None

    return Person(
        tree_id=tree_id,
        given_name=given_name,
        family_name=family_name,
        maiden_name=maiden_name,
        gender=gender,
        birth_date=b_date1,
        birth_date_qualifier=b_qual,
        birth_date_2=b_date2,
        birth_date_original=b_orig,
        birth_location=b_loc,
        death_date=d_date1,
        death_date_qualifier=d_qual,
        death_date_2=d_date2,
        death_date_original=d_orig,
        death_location=d_loc,
        is_living=is_living,
        occupation=occupation,
        education=education,
        nationalities=nationalities,
        bio=bio,
    )


# ─── Family import ────────────────────────────────────────────────────────────

def _import_families(
    db: Session,
    tree_id: uuid.UUID,
    reader,
    xref_map: dict[str, uuid.UUID],
    result: ImportResult,
) -> None:
    for fam in reader.records0("FAM"):
        try:
            _process_family(db, tree_id, fam, xref_map, result)
        except Exception as e:
            result.errors.append(f"FAM {fam.xref_id}: {e}")
            result.skipped += 1

    db.commit()


def _resolve_rec(rec, xref_map: dict[str, uuid.UUID]) -> uuid.UUID | None:
    """Resolve a ged4py record (which may be the linked INDI itself) to a person UUID."""
    if rec is None:
        return None
    # ged4py resolves xref pointers, so rec may be the actual Individual record
    xref = getattr(rec, "xref_id", None) or getattr(rec, "value", None)
    key = _normalize_xref(str(xref) if xref else None)
    return xref_map.get(key) if key else None


def _process_family(
    db: Session,
    tree_id: uuid.UUID,
    fam,
    xref_map: dict[str, uuid.UUID],
    result: ImportResult,
) -> None:
    husb_id = _resolve_rec(fam.sub_tag("HUSB"), xref_map)
    wife_id = _resolve_rec(fam.sub_tag("WIFE"), xref_map)

    # Spouse relationship
    if husb_id and wife_id:
        marr = fam.sub_tag("MARR")
        marr_d1, _, _, _ = _parse_date(_get_date_value(marr))
        div = fam.sub_tag("DIV")
        div_d1, _, _, _ = _parse_date(_get_date_value(div))

        db.add(Relationship(
            tree_id=tree_id,
            person_a_id=husb_id,
            person_b_id=wife_id,
            relationship_type="spouse",
            start_date=marr_d1,
            end_date=div_d1,
        ))
        result.relationships_created += 1

    # Parent-child relationships
    for chil_rec in fam.sub_tags("CHIL"):
        chil_id = _resolve_rec(chil_rec, xref_map)
        if not chil_id:
            result.skipped += 1
            continue
        for parent_id in filter(None, [husb_id, wife_id]):
            db.add(Relationship(
                tree_id=tree_id,
                person_a_id=parent_id,
                person_b_id=chil_id,
                relationship_type="parent",
            ))
            result.relationships_created += 1
