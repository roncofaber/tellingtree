def test_health(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_register(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "newuser@example.com",
        "username": "newuser",
        "password": "securepassword123",
        "full_name": "New User",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "newuser@example.com"
    assert data["username"] == "newuser"
    assert "id" in data


def test_register_duplicate_email(client, registered_user, make_invite):
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "username": "different",
        "password": "securepassword123",
        "invite_token": make_invite(),
    })
    assert response.status_code == 409


def test_register_duplicate_username(client, registered_user, make_invite):
    response = client.post("/api/v1/auth/register", json={
        "email": "different@example.com",
        "username": "testuser",
        "password": "securepassword123",
        "invite_token": make_invite(),
    })
    assert response.status_code == 409


def test_login(client, registered_user):
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpassword123",
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client, registered_user):
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "wrongpassword",
    })
    assert response.status_code == 401


def test_get_me(client, auth_headers):
    response = client.get("/api/v1/users/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@example.com"


def test_get_me_no_token(client):
    response = client.get("/api/v1/users/me")
    assert response.status_code in (401, 403)


def test_update_me(client, auth_headers):
    response = client.put("/api/v1/users/me", headers=auth_headers, json={
        "full_name": "Updated Name",
    })
    assert response.status_code == 200
    assert response.json()["full_name"] == "Updated Name"


def test_refresh_token(client, registered_user):
    login = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpassword123",
    })
    refresh_token = login.json()["refresh_token"]

    response = client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_token,
    })
    assert response.status_code == 200
    assert "access_token" in response.json()
