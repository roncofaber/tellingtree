"""Tests for GEDCOM 5.5.1 import endpoint."""

import io
import json
import pytest


def parse_ndjson_result(response) -> dict:
    """Parse an NDJSON streaming response and return the final 'done' event."""
    assert response.status_code == 200
    lines = [l for l in response.text.strip().split("\n") if l.strip()]
    last = json.loads(lines[-1])
    assert last["phase"] == "done"
    return last


MINIMAL_GEDCOM = b"""\
0 HEAD
1 SOUR TestApp
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Giovanni /ROSSI/
2 GIVN Giovanni
2 SURN ROSSI
1 SEX M
1 BIRT
2 DATE 15 MAR 1900
2 PLAC Milan, Italy
1 DEAT
2 DATE 10 JUN 1970
2 PLAC Rome, Italy
1 OCCU Farmer
1 FAMS @F1@
0 @I2@ INDI
1 NAME Maria /BIANCHI/
2 GIVN Maria
2 SURN BIANCHI
1 SEX F
1 BIRT
2 DATE ABT 1905
2 PLAC Naples, Italy
1 FAMS @F1@
0 @I3@ INDI
1 NAME Luca /ROSSI/
2 GIVN Luca
2 SURN ROSSI
1 SEX M
1 BIRT
2 DATE 1930
1 FAMC @F1@
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 20 APR 1925
0 TRLR
"""


@pytest.fixture
def tree_id(client, auth_headers):
    return client.post("/api/v1/trees", headers=auth_headers, json={"name": "GEDCOM Test"}).json()["id"]


def test_gedcom_import_basic(client, auth_headers, tree_id):
    """Importing a minimal GEDCOM creates persons and relationships."""
    r = client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    data = parse_ndjson_result(r)
    assert data["persons_created"] == 3
    assert data["relationships_created"] >= 3  # 1 spouse + 2 parent-child pairs
    assert data["errors"] == []


def test_gedcom_import_person_fields(client, auth_headers, tree_id):
    """Imported persons have correct names, gender, dates, and occupation."""
    client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    persons = client.get(
        f"/api/v1/trees/{tree_id}/persons",
        headers=auth_headers,
        params={"limit": 10},
    ).json()["items"]

    by_name = {p["given_name"]: p for p in persons}
    assert "Giovanni" in by_name
    assert "Maria" in by_name
    assert "Luca" in by_name

    giovanni = by_name["Giovanni"]
    assert giovanni["family_name"] == "Rossi"
    assert giovanni["gender"] == "male"
    assert giovanni["birth_date"] == "1900-03-15"
    assert giovanni["birth_date_qualifier"] == "exact"
    assert giovanni["birth_location"] == "Milan, Italy"
    assert giovanni["death_date"] == "1970-06-10"
    assert giovanni["is_living"] is False
    assert giovanni["occupation"] == "Farmer"


def test_gedcom_import_approximate_date(client, auth_headers, tree_id):
    """ABT dates are parsed with 'about' qualifier."""
    client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    persons = client.get(
        f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, params={"limit": 10}
    ).json()["items"]
    maria = next(p for p in persons if p["given_name"] == "Maria")
    assert maria["birth_date_qualifier"] == "about"
    assert maria["birth_date_original"] is not None


def test_gedcom_import_year_only_date(client, auth_headers, tree_id):
    """Year-only dates (no month/day) use 'year-only' qualifier."""
    client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    persons = client.get(
        f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, params={"limit": 10}
    ).json()["items"]
    luca = next(p for p in persons if p["given_name"] == "Luca")
    assert luca["birth_date_qualifier"] == "year-only"
    assert luca["birth_date"] == "1930-01-01"


def test_gedcom_import_spouse_relationship(client, auth_headers, tree_id):
    """FAM MARR date becomes relationship start_date on the spouse relationship."""
    client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    rels = client.get(
        f"/api/v1/trees/{tree_id}/relationships",
        headers=auth_headers,
        params={"limit": 20},
    ).json()["items"]

    spouse_rels = [r for r in rels if r["relationship_type"] == "spouse"]
    assert len(spouse_rels) >= 1
    assert any(r["start_date"] == "1925-04-20" for r in spouse_rels)


def test_gedcom_import_parent_child(client, auth_headers, tree_id):
    """FAM CHIL entries create parent relationships for both parents."""
    client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    rels = client.get(
        f"/api/v1/trees/{tree_id}/relationships",
        headers=auth_headers,
        params={"limit": 20},
    ).json()["items"]
    parent_rels = [r for r in rels if r["relationship_type"] == "parent"]
    assert len(parent_rels) == 2  # father→child + mother→child


GEDCOM_WITH_HTML = b"""\
0 HEAD
1 SOUR TestApp
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Boadicea /ICENIANS/
2 GIVN Boadicea
2 SURN ICENIANS
1 SEX F
1 NOTE
2 CONT <div id="j1">Boadicea Queen of Icenians</div>
<div id="j2"><br />Also known as Boudicca</div>
<p>Famous warrior queen.</p>
2 CONT Regular continuation here.
0 TRLR
"""


def test_gedcom_import_html_notes(client, auth_headers, tree_id):
    """GEDCOM files with HTML in NOTE records are sanitized and imported."""
    r = client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(GEDCOM_WITH_HTML), "application/octet-stream")},
    )
    data = parse_ndjson_result(r)
    assert data["persons_created"] == 1
    assert data["errors"] == []


def test_gedcom_import_duplicate_detection(client, auth_headers, tree_id):
    """Importing the same GEDCOM twice detects duplicates on the second import."""
    r1 = client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    data1 = parse_ndjson_result(r1)
    assert data1["persons_created"] == 3
    assert data1["duplicates_skipped"] == 0

    r2 = client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(MINIMAL_GEDCOM), "application/octet-stream")},
    )
    data2 = parse_ndjson_result(r2)
    assert data2["persons_created"] == 0
    assert data2["duplicates_skipped"] == 3


def test_gedcom_import_invalid_file(client, auth_headers, tree_id):
    """Non-GEDCOM content returns 200 with errors (no crash)."""
    r = client.post(
        f"/api/v1/trees/{tree_id}/import/gedcom",
        headers=auth_headers,
        files={"file": ("test.ged", io.BytesIO(b"this is not gedcom"), "application/octet-stream")},
    )
    # Should not crash — returns result (possibly with errors)
    assert r.status_code == 200
