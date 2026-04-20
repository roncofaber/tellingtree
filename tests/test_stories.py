import pytest


@pytest.fixture
def tree_with_person(client, auth_headers):
    tree = client.post("/api/v1/trees", headers=auth_headers, json={"name": "Story Tree"})
    tree_id = tree.json()["id"]

    person = client.post(f"/api/v1/trees/{tree_id}/persons", headers=auth_headers, json={
        "given_name": "Grandma",
    })
    person_id = person.json()["id"]

    return tree_id, person_id


def test_create_story(client, auth_headers, tree_with_person):
    tree_id, person_id = tree_with_person
    response = client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "Summer of '62",
        "content": "It was the hottest summer anyone could remember...",
        "event_date": "1962-07-01",
        "event_location": "Kansas City",
        "person_ids": [person_id],
    })
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Summer of '62"
    assert person_id in data["person_ids"]


def test_list_stories(client, auth_headers, tree_with_person):
    tree_id, _ = tree_with_person
    client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "Story 1",
    })
    client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "Story 2",
    })

    response = client.get(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["total"] == 2


def test_filter_stories_by_person(client, auth_headers, tree_with_person):
    tree_id, person_id = tree_with_person
    client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "With Person",
        "person_ids": [person_id],
    })
    client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "Without Person",
    })

    response = client.get(
        f"/api/v1/trees/{tree_id}/stories?person_id={person_id}", headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["title"] == "With Person"


def test_story_tagging(client, auth_headers, tree_with_person):
    tree_id, _ = tree_with_person

    tag = client.post(f"/api/v1/trees/{tree_id}/tags", headers=auth_headers, json={
        "name": "childhood",
        "color": "#FF5733",
    })
    tag_id = tag.json()["id"]

    story = client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "Tagged Story",
        "tag_ids": [tag_id],
    })
    assert story.status_code == 201
    assert tag_id in story.json()["tag_ids"]


def test_delete_story(client, auth_headers, tree_with_person):
    tree_id, _ = tree_with_person
    create = client.post(f"/api/v1/trees/{tree_id}/stories", headers=auth_headers, json={
        "title": "Temp Story",
    })
    story_id = create.json()["id"]

    response = client.delete(
        f"/api/v1/trees/{tree_id}/stories/{story_id}", headers=auth_headers
    )
    assert response.status_code == 204
