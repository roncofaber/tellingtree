def test_create_tree(client, auth_headers):
    response = client.post("/api/v1/trees", headers=auth_headers, json={
        "name": "My Family Tree",
        "description": "A tree of memories",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "My Family Tree"
    assert data["is_public"] is False


def test_list_trees(client, auth_headers):
    client.post("/api/v1/trees", headers=auth_headers, json={"name": "Tree 1"})
    client.post("/api/v1/trees", headers=auth_headers, json={"name": "Tree 2"})

    response = client.get("/api/v1/trees", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_get_tree(client, auth_headers):
    create = client.post("/api/v1/trees", headers=auth_headers, json={"name": "Test"})
    tree_id = create.json()["id"]

    response = client.get(f"/api/v1/trees/{tree_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["name"] == "Test"


def test_update_tree(client, auth_headers):
    create = client.post("/api/v1/trees", headers=auth_headers, json={"name": "Old"})
    tree_id = create.json()["id"]

    response = client.put(f"/api/v1/trees/{tree_id}", headers=auth_headers, json={
        "name": "New Name",
    })
    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


def test_delete_tree(client, auth_headers):
    create = client.post("/api/v1/trees", headers=auth_headers, json={"name": "Delete Me"})
    tree_id = create.json()["id"]

    response = client.delete(f"/api/v1/trees/{tree_id}", headers=auth_headers)
    assert response.status_code == 204

    response = client.get(f"/api/v1/trees/{tree_id}", headers=auth_headers)
    assert response.status_code == 404
