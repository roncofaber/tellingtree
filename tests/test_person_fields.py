"""Tests for extended person fields and flexible date model."""

import pytest


@pytest.fixture
def tree_id(client, auth_headers):
    return client.post("/api/v1/trees", headers=auth_headers, json={"name": "T"}).json()["id"]


def test_extended_fields_roundtrip(client, auth_headers, tree_id):
    """All new person fields are stored and returned correctly."""
    payload = {
        "given_name": "Maria",
        "family_name": "Rossi",
        "maiden_name": "Bianchi",
        "nickname": "Mimi",
        "birth_date": "1924-05-13",
        "birth_location": "Mendrisio, Switzerland",
        "death_date": "2000-01-01",
        "death_location": "Lugano, Switzerland",
        "gender": "female",
        "is_living": False,
        "occupation": "Teacher",
        "nationalities": ["Italian", "Swiss"],
        "education": "University of Milan",
        "bio": "A remarkable woman.",
    }
    r = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json=payload)
    assert r.status_code == 201
    data = r.json()

    assert data["maiden_name"] == "Bianchi"
    assert data["nickname"] == "Mimi"
    assert data["death_location"] == "Lugano, Switzerland"
    assert data["is_living"] is False
    assert data["occupation"] == "Teacher"
    assert data["nationalities"] == ["Italian", "Swiss"]
    assert data["education"] == "University of Milan"
    assert data["bio"] == "A remarkable woman."


def test_flexible_date_qualifier(client, auth_headers, tree_id):
    """Flexible date fields (qualifier, range, original) are stored correctly."""
    r = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Unknown",
        "birth_date": "1850-01-01",
        "birth_date_qualifier": "about",
        "birth_date_original": "ABT 1850",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["birth_date_qualifier"] == "about"
    assert data["birth_date_original"] == "ABT 1850"


def test_flexible_date_between(client, auth_headers, tree_id):
    """Between-range dates (date + date_2) are stored correctly."""
    r = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Range",
        "birth_date": "1800-01-01",
        "birth_date_qualifier": "between",
        "birth_date_2": "1820-01-01",
        "birth_date_original": "BET 1800 AND 1820",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["birth_date_qualifier"] == "between"
    assert data["birth_date_2"] == "1820-01-01"


def test_nationalities_json_array(client, auth_headers, tree_id):
    """Nationalities stored as JSON array; empty array vs None are distinct."""
    r = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Multi",
        "nationalities": ["French", "Belgian", "Swiss"],
    })
    assert r.status_code == 201
    assert r.json()["nationalities"] == ["French", "Belgian", "Swiss"]


def test_update_clears_field(client, auth_headers, tree_id):
    """Updating with null clears a field."""
    create = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Test",
        "occupation": "Farmer",
    }).json()
    assert create["occupation"] == "Farmer"

    updated = client.put(
        f"/api/v1/trees/{tree_id}/persons/{create['id']}",
        headers=auth_headers,
        json={"occupation": None},
    ).json()
    assert updated["occupation"] is None


def test_is_living_tri_state(client, auth_headers, tree_id):
    """is_living accepts True, False, and null (unknown)."""
    for value in (True, False, None):
        r = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
            "given_name": "Test",
            "is_living": value,
        })
        assert r.status_code == 201
        assert r.json()["is_living"] == value
