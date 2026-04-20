"""Tests for the Places API (geocoding cache + CRUD)."""

import pytest


@pytest.fixture
def tree_id(client, auth_headers):
    return client.post("/api/v1/trees", headers=auth_headers, json={"name": "T"}).json()["id"]


@pytest.fixture
def place_id(client, auth_headers):
    r = client.post("/api/v1/places", headers=auth_headers, json={
        "display_name": "Lugano, Ticino, Switzerland",
        "city": "Lugano", "region": "Ticino", "country": "Switzerland",
        "country_code": "CH", "lat": 46.0101, "lon": 8.9601,
    })
    assert r.status_code == 201
    return r.json()["id"]


def test_create_place(client, auth_headers):
    r = client.post("/api/v1/places", headers=auth_headers, json={
        "display_name": "Milan, Italy",
        "city": "Milan", "country": "Italy", "country_code": "IT",
        "lat": 45.4642, "lon": 9.1900,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["display_name"] == "Milan, Italy"
    assert data["country_code"] == "IT"
    assert data["geocoder"] == "manual"


def test_get_place(client, auth_headers, place_id):
    r = client.get(f"/api/v1/places/{place_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == place_id


def test_update_place(client, auth_headers, place_id):
    r = client.put(f"/api/v1/places/{place_id}", headers=auth_headers, json={
        "display_name": "Lugano, Switzerland",
        "lat": 46.0101, "lon": 8.9601,
    })
    assert r.status_code == 200
    data = r.json()
    assert data["display_name"] == "Lugano, Switzerland"
    assert data["geocoder"] == "manual"


def test_delete_place(client, auth_headers, place_id):
    r = client.delete(f"/api/v1/places/{place_id}", headers=auth_headers)
    assert r.status_code == 204
    r2 = client.get(f"/api/v1/places/{place_id}", headers=auth_headers)
    assert r2.status_code == 404


def test_delete_place_unlinks_persons(client, auth_headers, tree_id, place_id):
    """Deleting a place should unlink it from persons without deleting the persons."""
    person = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Test", "birth_place_id": place_id,
    }).json()
    assert person["birth_place_id"] == place_id

    client.delete(f"/api/v1/places/{place_id}", headers=auth_headers)

    updated = client.get(
        f"/api/v1/trees/{tree_id}/persons/{person['id']}", headers=auth_headers
    ).json()
    assert updated["birth_place_id"] is None


def test_list_tree_places(client, auth_headers, tree_id, place_id):
    client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Anna", "birth_place_id": place_id,
    })
    r = client.get(f"/api/v1/trees/{tree_id}/places", headers=auth_headers)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert place_id in ids


def test_list_tree_places_deduplicates(client, auth_headers, tree_id, place_id):
    """Same place linked to birth AND death of different persons should appear once."""
    client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "A", "birth_place_id": place_id,
    })
    client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "B", "death_place_id": place_id,
    })
    r = client.get(f"/api/v1/trees/{tree_id}/places", headers=auth_headers)
    assert len([p for p in r.json() if p["id"] == place_id]) == 1


def test_place_search_local(client, auth_headers, place_id):
    """Searching with a term matching an existing display_name returns it without geocoding."""
    r = client.get("/api/v1/places/search", headers=auth_headers, params={"q": "Lugano"})
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    assert place_id in ids


def test_place_search_requires_min_length(client, auth_headers):
    r = client.get("/api/v1/places/search", headers=auth_headers, params={"q": "L"})
    assert r.status_code == 422


def test_person_birth_place_roundtrip(client, auth_headers, tree_id, place_id):
    """birth_place_id and death_place_id are stored and returned correctly."""
    r = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Maria",
        "birth_location": "Lugano, Ticino, Switzerland",
        "birth_place_id": place_id,
        "death_place_id": place_id,
    })
    assert r.status_code == 201
    data = r.json()
    assert data["birth_place_id"] == place_id
    assert data["death_place_id"] == place_id
    assert data["birth_location"] == "Lugano, Ticino, Switzerland"
