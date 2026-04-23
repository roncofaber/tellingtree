import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, StaticPool
from sqlalchemy.orm import sessionmaker

from app.core.rate_limit import account_lockout, auth_rate_limiter, avatar_rate_limiter
from app.db.base import Base
from app.db.session import get_db
from app.main import app

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    auth_rate_limiter._requests.clear()
    avatar_rate_limiter._requests.clear()
    account_lockout._failures.clear()
    account_lockout._locked_until.clear()
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        yield db

    app.dependency_overrides[get_db] = override_get_db
    app.state.db_factory = TestingSessionLocal
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def _make_user_directly(db, *, email, username, password, full_name=None, is_superadmin=False):
    """Create an approved User directly via DB, bypassing the invite/approval flow.
    Used by tests that need multiple users without the invite ceremony."""
    from app.core.security import hash_password
    from app.models.user import User
    user = User(
        email=email, username=username,
        password_hash=hash_password(password),
        full_name=full_name,
        is_approved=True,
        is_superadmin=is_superadmin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def make_user(db):
    """Factory fixture: create a pre-approved test user directly via DB.
    Returns a callable: make_user(email=..., username=..., password=...) -> User."""
    return lambda **kwargs: _make_user_directly(db, **kwargs)


@pytest.fixture
def make_invite(db):
    """Factory fixture: create a registration invite directly via DB.
    Returns a callable: make_invite(email=None, days=7) -> token string."""
    import secrets
    from datetime import datetime, timedelta, timezone
    from app.models.registration_invite import RegistrationInvite

    def _make(email: str | None = None, days: int = 7) -> str:
        token = secrets.token_urlsafe(32)
        invite = RegistrationInvite(
            token=token,
            email=email,
            expires_at=datetime.now(timezone.utc) + timedelta(days=days),
        )
        db.add(invite)
        db.commit()
        return token

    return _make


@pytest.fixture
def registered_user(client):
    """First user via the API — exercises the bootstrap path (becomes superadmin+approved)."""
    response = client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "username": "testuser",
        "password": "testpassword123",
        "full_name": "Test User",
    })
    return response.json()


@pytest.fixture
def auth_headers(client, registered_user):
    response = client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "testpassword123",
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
