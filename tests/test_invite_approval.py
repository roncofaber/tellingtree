"""Invite-only registration + admin-approval gating."""

import secrets
from datetime import datetime, timedelta, timezone


def test_bootstrap_first_user_becomes_superadmin_and_approved(client):
    response = client.post("/api/v1/auth/register", json={
        "email": "first@example.com",
        "username": "first",
        "password": "password123",
    })
    assert response.status_code == 201
    data = response.json()
    assert data["is_approved"] is True
    assert data["is_superadmin"] is True


def test_second_registration_requires_invite_token(client, registered_user):
    response = client.post("/api/v1/auth/register", json={
        "email": "second@example.com",
        "username": "second",
        "password": "password123",
    })
    assert response.status_code == 400
    assert "invite" in response.json()["detail"].lower()


def test_registration_with_valid_invite(client, registered_user, make_invite):
    token = make_invite()
    response = client.post("/api/v1/auth/register", json={
        "email": "second@example.com",
        "username": "second",
        "password": "password123",
        "invite_token": token,
    })
    assert response.status_code == 201
    data = response.json()
    assert data["is_approved"] is False  # awaiting approval
    assert data["is_superadmin"] is False


def test_registration_with_expired_invite_rejected(client, registered_user, db, make_invite):
    from app.models.registration_invite import RegistrationInvite

    token = make_invite()
    invite = db.query(RegistrationInvite).filter(RegistrationInvite.token == token).first()
    invite.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()

    response = client.post("/api/v1/auth/register", json={
        "email": "second@example.com",
        "username": "second",
        "password": "password123",
        "invite_token": token,
    })
    assert response.status_code == 400
    assert "expired" in response.json()["detail"].lower()


def test_registration_with_used_invite_rejected(client, registered_user, make_invite):
    token = make_invite()
    # First registration uses it
    client.post("/api/v1/auth/register", json={
        "email": "alice@example.com", "username": "alice", "password": "password123",
        "invite_token": token,
    })
    # Second attempt with same token must fail
    response = client.post("/api/v1/auth/register", json={
        "email": "bob@example.com", "username": "bob123", "password": "password123",
        "invite_token": token,
    })
    assert response.status_code == 400
    assert "used" in response.json()["detail"].lower()


def test_email_locked_invite_enforced(client, registered_user, make_invite):
    token = make_invite(email="locked@example.com")
    # Wrong email rejected
    bad = client.post("/api/v1/auth/register", json={
        "email": "different@example.com", "username": "wrongmail", "password": "password123",
        "invite_token": token,
    })
    assert bad.status_code == 400

    # Correct email succeeds
    good = client.post("/api/v1/auth/register", json={
        "email": "locked@example.com", "username": "rightmail", "password": "password123",
        "invite_token": token,
    })
    assert good.status_code == 201


def test_invalid_invite_token_rejected(client, registered_user):
    response = client.post("/api/v1/auth/register", json={
        "email": "xyz@example.com", "username": "xyzuser", "password": "password123",
        "invite_token": "totally-fake-token",
    })
    assert response.status_code == 400


def test_unapproved_user_cannot_login(client, registered_user, make_invite):
    client.post("/api/v1/auth/register", json={
        "email": "pending@example.com", "username": "pending", "password": "password123",
        "invite_token": make_invite(),
    })
    response = client.post("/api/v1/auth/login", json={
        "username": "pending", "password": "password123",
    })
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["code"] == "pending_approval"


def test_validate_invite_endpoint(client, registered_user, make_invite, db):
    from app.models.registration_invite import RegistrationInvite

    valid_token = make_invite(email="x@example.com")
    response = client.get(f"/api/v1/auth/registration-invites/{valid_token}/validate")
    assert response.status_code == 200
    body = response.json()
    assert body["valid"] is True
    assert body["email"] == "x@example.com"

    # Unknown token
    response = client.get("/api/v1/auth/registration-invites/nope/validate")
    assert response.json() == {"valid": False, "email": None, "expired": False, "used": False}

    # Expired
    expired_token = make_invite()
    invite = db.query(RegistrationInvite).filter(RegistrationInvite.token == expired_token).first()
    invite.expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
    db.commit()
    response = client.get(f"/api/v1/auth/registration-invites/{expired_token}/validate")
    body = response.json()
    assert body["valid"] is False
    assert body["expired"] is True


# ── Admin endpoints ─────────────────────────────────────────────────────────────


def _login(client, username, password):
    resp = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def test_admin_can_create_and_list_invites(client, registered_user):
    headers = _login(client, "testuser", "testpassword123")
    create = client.post(
        "/api/v1/admin/registration-invites",
        json={"email": "alice@example.com", "note": "Hi Alice", "expires_in_days": 7},
        headers=headers,
    )
    assert create.status_code == 201
    assert "token" in create.json()

    listing = client.get("/api/v1/admin/registration-invites", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1


def test_non_admin_cannot_use_admin_endpoints(client, registered_user, make_user):
    # Create a non-admin user (approved, not superadmin)
    make_user(email="regular@example.com", username="regular", password="password123")
    headers = _login(client, "regular", "password123")
    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 403


def test_admin_approves_pending_user(client, registered_user, make_invite):
    # Register a pending user
    client.post("/api/v1/auth/register", json={
        "email": "pending@example.com", "username": "pending", "password": "password123",
        "invite_token": make_invite(),
    })
    # Login as admin
    headers = _login(client, "testuser", "testpassword123")
    users = client.get("/api/v1/admin/users", headers=headers).json()
    pending_id = next(u["id"] for u in users if u["username"] == "pending")

    approve = client.put(f"/api/v1/admin/users/{pending_id}/approve", headers=headers)
    assert approve.status_code == 200
    assert approve.json()["is_approved"] is True

    # Pending user can now login
    login = client.post("/api/v1/auth/login", json={
        "username": "pending", "password": "password123",
    })
    assert login.status_code == 200


def test_admin_rejects_user_invalidates_session(client, registered_user, make_invite):
    # Approved user gets a session
    client.post("/api/v1/auth/register", json={
        "email": "willbe@example.com", "username": "willbe", "password": "password123",
        "invite_token": make_invite(),
    })
    admin_headers = _login(client, "testuser", "testpassword123")
    users = client.get("/api/v1/admin/users", headers=admin_headers).json()
    target_id = next(u["id"] for u in users if u["username"] == "willbe")

    client.put(f"/api/v1/admin/users/{target_id}/approve", headers=admin_headers)

    # User logs in successfully
    login = client.post("/api/v1/auth/login", json={
        "username": "willbe", "password": "password123",
    })
    user_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Admin rejects them
    client.put(f"/api/v1/admin/users/{target_id}/reject", headers=admin_headers)

    # Existing session is now revoked (token_version bumped)
    me = client.get("/api/v1/users/me", headers=user_headers)
    assert me.status_code == 401


def test_admin_cannot_revoke_used_invite(client, registered_user, make_invite, db):
    from app.models.registration_invite import RegistrationInvite

    token = make_invite()
    client.post("/api/v1/auth/register", json={
        "email": "used@example.com", "username": "used", "password": "password123",
        "invite_token": token,
    })
    invite = db.query(RegistrationInvite).filter(RegistrationInvite.token == token).first()

    headers = _login(client, "testuser", "testpassword123")
    response = client.delete(f"/api/v1/admin/registration-invites/{invite.id}", headers=headers)
    assert response.status_code == 400
