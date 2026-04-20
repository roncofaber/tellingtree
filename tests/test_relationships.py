import pytest


@pytest.fixture
def tree_and_persons(client, auth_headers):
    tree = client.post("/api/v1/trees", headers=auth_headers, json={"name": "Test"})
    tree_id = tree.json()["id"]

    p1 = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Parent",
    })
    p2 = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Child",
    })
    return tree_id, p1.json()["id"], p2.json()["id"]


def test_create_relationship(client, auth_headers, tree_and_persons):
    tree_id, p1, p2 = tree_and_persons
    response = client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "parent",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["relationship_type"] == "parent"


def test_auto_inverse_created(client, auth_headers, tree_and_persons):
    tree_id, p1, p2 = tree_and_persons
    client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "parent",
    })
    response = client.get(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers)
    data = response.json()
    assert data["total"] == 2
    types = {r["relationship_type"] for r in data["items"]}
    assert types == {"parent", "child"}


def test_auto_inverse_deleted(client, auth_headers, tree_and_persons):
    tree_id, p1, p2 = tree_and_persons
    rel = client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "parent",
    }).json()
    client.delete(f"/api/v1/trees/{tree_id}/relationships/{rel['id']}", headers=auth_headers)
    response = client.get(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers)
    assert response.json()["total"] == 0


def test_self_relationship_rejected(client, auth_headers, tree_and_persons):
    tree_id, p1, _ = tree_and_persons
    response = client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p1,
        "relationship_type": "self",
    })
    assert response.status_code == 400


def test_list_relationships(client, auth_headers, tree_and_persons):
    tree_id, p1, p2 = tree_and_persons
    client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "parent",
    })

    response = client.get(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers)
    assert response.status_code == 200
    # "parent" creates "child" inverse automatically → 2 records
    assert response.json()["total"] == 2


def test_get_person_relationships(client, auth_headers, tree_and_persons):
    tree_id, p1, p2 = tree_and_persons
    client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "parent",
    })

    response = client.get(
        f"/api/v1/trees/{tree_id}/persons/{p1}/relationships", headers=auth_headers
    )
    assert response.status_code == 200
    # p1 appears in both records: as person_a in "parent" and person_b in "child"
    assert len(response.json()) == 2


def test_relationship_types_endpoint(client):
    response = client.get("/api/v1/relationship-types")
    assert response.status_code == 200
    types = response.json()
    assert len(types) > 0
    keys = {t["key"] for t in types}
    assert "parent" in keys
    assert "child" in keys
    assert "spouse" in keys
    parent = next(t for t in types if t["key"] == "parent")
    assert parent["inverse"] == "child"


def test_spouse_relationship_with_dates(client, auth_headers, tree_and_persons):
    """Spouse relationships store start and end dates."""
    tree_id, p1, p2 = tree_and_persons
    r = client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "spouse",
        "start_date": "1950-06-15",
        "end_date": "1980-03-01",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["start_date"] == "1950-06-15"
    assert data["end_date"] == "1980-03-01"


def test_inverse_copies_dates(client, auth_headers, tree_and_persons):
    """Auto-created inverse relationship carries the same start/end dates."""
    tree_id, p1, p2 = tree_and_persons
    client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "spouse",
        "start_date": "1955-08-20",
        "end_date": "1990-01-01",
    })
    rels = client.get(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers).json()
    # spouse creates a mutual inverse spouse; both should have the same dates
    for rel in rels["items"]:
        assert rel["start_date"] == "1955-08-20", f"start_date missing on {rel}"
        assert rel["end_date"] == "1990-01-01", f"end_date missing on {rel}"


def test_partner_relationship_with_dates(client, auth_headers, tree_and_persons):
    """Partner (non-married) relationships also support date fields."""
    tree_id, p1, p2 = tree_and_persons
    r = client.post(f"/api/v1/trees/{tree_id}/relationships", headers=auth_headers, json={
        "person_a_id": p1,
        "person_b_id": p2,
        "relationship_type": "partner",
        "start_date": "2000-01-01",
    })
    assert r.status_code == 201
    assert r.json()["start_date"] == "2000-01-01"
    assert r.json()["end_date"] is None
