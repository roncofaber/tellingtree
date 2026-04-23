"""Per-account lockout after repeated failed logins."""

from app.core.rate_limit import account_lockout


def _login(client, username, password):
    return client.post("/api/v1/auth/login", json={"username": username, "password": password})


def test_lockout_after_max_failures(client, registered_user):
    # Threshold is 8 failures within 15 min. Burn through them.
    for _ in range(account_lockout._max_failures):
        resp = _login(client, "testuser", "wrong-password")
        assert resp.status_code == 401

    # The next attempt — even with the CORRECT password — must be locked.
    resp = _login(client, "testuser", "testpassword123")
    assert resp.status_code == 400
    assert "too many" in resp.json()["detail"].lower()


def test_lockout_applies_to_nonexistent_users_too(client, registered_user):
    """Locking nonexistent usernames prevents enumeration via lockout messages."""
    for _ in range(account_lockout._max_failures):
        _login(client, "definitely-not-a-user", "x" * 12)

    resp = _login(client, "definitely-not-a-user", "anything")
    assert resp.status_code == 400
    assert "too many" in resp.json()["detail"].lower()


def test_successful_login_clears_failure_counter(client, registered_user):
    # A few failures, then a success — counter resets, no lockout next time.
    for _ in range(3):
        _login(client, "testuser", "wrong")

    success = _login(client, "testuser", "testpassword123")
    assert success.status_code == 200

    # Should still be able to fail freely afterwards (counter cleared).
    for _ in range(3):
        _login(client, "testuser", "wrong")
    # Still not locked (only 3 fresh failures)
    success2 = _login(client, "testuser", "testpassword123")
    assert success2.status_code == 200


def test_username_normalization(client, registered_user):
    """Lockout key is case- and whitespace-insensitive."""
    for _ in range(account_lockout._max_failures):
        _login(client, "TESTUSER", "wrong")

    # Same account, lowercase — should be locked.
    resp = _login(client, "testuser", "testpassword123")
    assert resp.status_code == 400
