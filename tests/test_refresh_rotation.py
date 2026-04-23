"""Refresh-token rotation: each refresh issues a new jti, replays kill all sessions.

The test client persists cookies across requests, so each test clears the cookie
jar before the request whose payload it wants to control via the JSON body.
"""


def _login(client, username, password):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def _refresh_via_body(client, token):
    client.cookies.clear()
    return client.post("/api/v1/auth/refresh", json={"refresh_token": token})


def test_refresh_returns_new_refresh_token(client, registered_user):
    initial = _login(client, "testuser", "testpassword123").json()
    refreshed = _refresh_via_body(client, initial["refresh_token"])
    assert refreshed.status_code == 200
    # Rotation: a fresh refresh token replaces the old one (jti differs).
    assert refreshed.json()["refresh_token"] != initial["refresh_token"]


def test_old_refresh_token_after_rotation_is_rejected(client, registered_user):
    initial = _login(client, "testuser", "testpassword123").json()

    # Legitimate user rotates: presents the original, gets a new pair.
    new_pair = _refresh_via_body(client, initial["refresh_token"]).json()

    # Replay of the original token must fail — its jti was rotated past.
    replay = _refresh_via_body(client, initial["refresh_token"])
    assert replay.status_code == 401

    # The legitimate user's NEW token still works (we don't escalate).
    follow_up = _refresh_via_body(client, new_pair["refresh_token"])
    assert follow_up.status_code == 200


def test_multi_device_independent_sessions(client, registered_user):
    laptop = _login(client, "testuser", "testpassword123").json()
    phone  = _login(client, "testuser", "testpassword123").json()
    assert laptop["refresh_token"] != phone["refresh_token"]

    assert _refresh_via_body(client, laptop["refresh_token"]).status_code == 200
    assert _refresh_via_body(client, phone["refresh_token"]).status_code == 200


def test_logout_kills_only_current_session(client, registered_user):
    laptop = _login(client, "testuser", "testpassword123").json()
    phone  = _login(client, "testuser", "testpassword123").json()

    # Logout the laptop session by passing its token in the body.
    client.cookies.clear()
    client.post("/api/v1/auth/logout", json={"refresh_token": laptop["refresh_token"]})

    # Laptop's refresh is dead.
    assert _refresh_via_body(client, laptop["refresh_token"]).status_code == 401
    # Phone still works.
    assert _refresh_via_body(client, phone["refresh_token"]).status_code == 200


def test_password_change_invalidates_all_sessions(client, registered_user):
    login = _login(client, "testuser", "testpassword123").json()
    headers = {"Authorization": f"Bearer {login['access_token']}"}

    client.put("/api/v1/users/me/password", headers=headers, json={
        "current_password": "testpassword123",
        "new_password": "brandnewpassword456",
    })

    # Old refresh token must now fail.
    assert _refresh_via_body(client, login["refresh_token"]).status_code == 401
