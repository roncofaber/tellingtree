import uuid

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.core.errors import ConflictError, UnauthorizedError
from app.core.rate_limit import auth_rate_limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.user import User
from app.schemas.user import LoginRequest, RefreshRequest, Token, UserCreate, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE = "refresh_token"
_COOKIE_PATH    = "/api/v1/auth/refresh"
_COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days, same as refresh token lifetime


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=settings.environment == "production",
        samesite="lax",
        max_age=_COOKIE_MAX_AGE,
        path=_COOKIE_PATH,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE, path=_COOKIE_PATH)


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: Request, data: UserCreate, db: Session = Depends(get_db)):
    auth_rate_limiter.check(request)
    if db.query(User).filter(User.email == data.email).first():
        raise ConflictError("Email already registered")
    if db.query(User).filter(User.username == data.username).first():
        raise ConflictError("Username already taken")

    user = User(
        email=data.email,
        username=data.username,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(request: Request, data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    auth_rate_limiter.check(request)
    user = db.query(User).filter(User.username == data.username).first()
    if user is None:
        verify_password(data.password, hash_password("dummy"))
        raise UnauthorizedError("Invalid username or password")
    if not verify_password(data.password, user.password_hash):
        raise UnauthorizedError("Invalid username or password")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated")

    access_token  = create_access_token(str(user.id), user.token_version)
    refresh_token = create_refresh_token(str(user.id), user.token_version)

    _set_refresh_cookie(response, refresh_token)

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
def refresh(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    data: RefreshRequest | None = None,
):
    # Cookie takes priority; fall back to body (Python client / existing integrations)
    raw = request.cookies.get(_REFRESH_COOKIE) or (data and data.refresh_token)
    if not raw:
        raise UnauthorizedError("No refresh token provided")

    payload = decode_token(raw)
    if payload is None or payload.get("type") != "refresh":
        raise UnauthorizedError("Invalid refresh token")

    user_id = payload.get("sub")
    try:
        uid = uuid.UUID(user_id)
    except (ValueError, TypeError):
        raise UnauthorizedError("Invalid token payload")

    user = db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()
    if user is None:
        raise UnauthorizedError("User not found")

    if payload.get("ver", 0) != user.token_version:
        raise UnauthorizedError("Token has been revoked")

    access_token  = create_access_token(str(user.id), user.token_version)
    refresh_token = create_refresh_token(str(user.id), user.token_version)

    _set_refresh_cookie(response, refresh_token)

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", status_code=204)
def logout(response: Response):
    _clear_refresh_cookie(response)
