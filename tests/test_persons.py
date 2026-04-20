import pytest


@pytest.fixture
def tree_id(client, auth_headers):
    response = client.post("/api/v1/trees", headers=auth_headers, json={
        "name": "Test Tree",
    })
    return response.json()["id"]


def test_create_person(client, auth_headers, tree_id):
    response = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "John",
        "family_name": "Doe",
        "birth_date": "1950-05-15",
        "gender": "male",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["given_name"] == "John"
    assert data["family_name"] == "Doe"


def test_list_persons(client, auth_headers, tree_id):
    client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Alice",
    })
    client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Bob",
    })

    response = client.get(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_update_person(client, auth_headers, tree_id):
    create = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Jane",
    })
    person_id = create.json()["id"]

    response = client.put(
        f"/api/v1/trees/{tree_id}/persons/{person_id}",
        headers=auth_headers,
        json={"family_name": "Smith"},
    )
    assert response.status_code == 200
    assert response.json()["family_name"] == "Smith"


def test_delete_person(client, auth_headers, tree_id):
    create = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Temp",
    })
    person_id = create.json()["id"]

    response = client.delete(
        f"/api/v1/trees/{tree_id}/persons/{person_id}", headers=auth_headers
    )
    assert response.status_code == 204
