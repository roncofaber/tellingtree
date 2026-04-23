import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.core.errors import BadRequestError, ConflictError, UnauthorizedError
from app.core.rate_limit import account_lockout, auth_rate_limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.session import get_db
from app.models.password_reset import PasswordResetToken
from app.models.refresh_session import RefreshSession
from app.models.registration_invite import RegistrationInvite
from app.models.user import User
from app.schemas.registration_invite import RegistrationInvitePublic
from app.schemas.user import LoginRequest, PasswordChange, RefreshRequest, Token, UserCreate, UserResponse
from app.services.email import send_password_reset


def _new_session(db: Session, user: User) -> str:
    """Create a new refresh session for the user; returns its jti."""
    jti = secrets.token_urlsafe(32)
    db.add(RefreshSession(user_id=user.id, jti=jti))
    db.commit()
    return jti


def _pending_approval_error() -> HTTPException:
    """403 with a structured payload the frontend can detect."""
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={"code": "pending_approval", "message": "Your account is awaiting admin approval."},
    )

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


@router.get("/registration-invites/{token}/validate", response_model=RegistrationInvitePublic)
def validate_registration_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(RegistrationInvite).filter(RegistrationInvite.token == token).first()
    if invite is None:
        return RegistrationInvitePublic(valid=False)
    if invite.is_used:
        return RegistrationInvitePublic(valid=False, used=True)
    if invite.is_expired:
        return RegistrationInvitePublic(valid=False, expired=True)
    return RegistrationInvitePublic(valid=True, email=invite.email)


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: Request, data: UserCreate, db: Session = Depends(get_db)):
    auth_rate_limiter.check(request)

    # Bootstrap: zero users in DB → no token required, becomes superadmin+approved.
    is_bootstrap = db.query(User.id).first() is None

    invite: RegistrationInvite | None = None
    if not is_bootstrap:
        if not data.invite_token:
            raise BadRequestError("Registration is by invite only")
        invite = (
            db.query(RegistrationInvite)
            .filter(RegistrationInvite.token == data.invite_token)
            .first()
        )
        if invite is None:
            raise BadRequestError("Invalid invite token")
        if invite.is_used:
            raise BadRequestError("This invite has already been used")
        if invite.is_expired:
            raise BadRequestError("This invite has expired")
        if invite.email and invite.email.lower() != data.email.lower():
            raise BadRequestError("This invite is locked to a different email address")

    if db.query(User).filter(User.email == data.email).first():
        raise ConflictError("Email already registered")
    if db.query(User).filter(User.username == data.username).first():
        raise ConflictError("Username already taken")

    user = User(
        email=data.email,
        username=data.username,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        is_approved=is_bootstrap,
        is_superadmin=is_bootstrap,
    )
    db.add(user)
    db.flush()  # populate user.id for the invite link

    if invite is not None:
        invite.used_by = user.id
        invite.used_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(request: Request, data: LoginRequest, response: Response, db: Session = Depends(get_db)):
    auth_rate_limiter.check(request)
    # Account lockout is checked BEFORE looking up the user so that a locked
    # nonexistent username gets the same response — no enumeration help.
    account_lockout.check_locked(data.username)

    user = db.query(User).filter(User.username == data.username).first()
    if user is None:
        verify_password(data.password, hash_password("dummy"))
        account_lockout.record_failure(data.username)
        raise UnauthorizedError("Invalid username or password")
    if not verify_password(data.password, user.password_hash):
        account_lockout.record_failure(data.username)
        raise UnauthorizedError("Invalid username or password")
    if not user.is_active:
        raise UnauthorizedError("Account is deactivated")
    if not user.is_approved:
        raise _pending_approval_error()

    account_lockout.record_success(data.username)

    jti = _new_session(db, user)
    access_token  = create_access_token(str(user.id), user.token_version)
    refresh_token = create_refresh_token(str(user.id), user.token_version, jti=jti)

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

    if not user.is_approved:
        raise _pending_approval_error()

    # ── Rotation: presented jti must match an active session ──────────────────
    presented_jti = payload.get("jti")
    session = (
        db.query(RefreshSession)
        .filter(RefreshSession.jti == presented_jti, RefreshSession.user_id == user.id)
        .first()
        if presented_jti else None
    )
    if session is None:
        # Token unknown: either rotated past, logged out, or an attacker is
        # replaying an old leak. We refuse this request; rotation already cut
        # off the attacker's path. We don't escalate to burning all sessions
        # because legitimate logout + a stale tab is indistinguishable from
        # a leak, and false positives create bad UX.
        raise UnauthorizedError("Refresh token has been revoked")

    # Rotate: replace this session's jti with a new one.
    new_jti = secrets.token_urlsafe(32)
    session.jti = new_jti
    session.last_used_at = datetime.now(timezone.utc)
    db.commit()

    access_token  = create_access_token(str(user.id), user.token_version)
    refresh_token = create_refresh_token(str(user.id), user.token_version, jti=new_jti)

    _set_refresh_cookie(response, refresh_token)

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    data: RefreshRequest | None = None,
):
    # Best-effort: tear down this device's session if we can identify it.
    # Cookie wins over body to match the refresh endpoint's convention.
    raw = request.cookies.get(_REFRESH_COOKIE) or (data and data.refresh_token)
    if raw:
        payload = decode_token(raw)
        if payload and payload.get("type") == "refresh":
            jti = payload.get("jti")
            if jti:
                db.query(RefreshSession).filter(RefreshSession.jti == jti).delete()
                db.commit()
    _clear_refresh_cookie(response)


# ── Password reset ─────────────────────────────────────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password", status_code=204)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Always return 204 — never reveal whether the email exists.
    from datetime import timedelta
    user = db.query(User).filter(User.email == data.email, User.is_active.is_(True)).first()
    if user and user.is_approved:
        # Invalidate any existing unused tokens for this user
        db.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).delete()
        token = secrets.token_urlsafe(32)
        db.add(PasswordResetToken(
            user_id=user.id,
            token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        ))
        db.commit()
        reset_url = f"{settings.app_url}/reset-password/{token}"
        send_password_reset(user.email, reset_url)


@router.post("/reset-password", status_code=204)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token == data.token).first()
    if record is None or record.is_used or record.is_expired:
        raise BadRequestError("Invalid or expired reset link")

    # Validate password strength (reuse the same validator as PasswordChange)
    try:
        PasswordChange.model_validate({"current_password": "x", "new_password": data.new_password})
    except Exception:
        raise BadRequestError(
            "Password must be at least 8 characters and contain at least one "
            "uppercase letter, number, or symbol."
        )

    user = db.query(User).filter(User.id == record.user_id).first()
    if user is None:
        raise BadRequestError("User not found")

    user.password_hash = hash_password(data.new_password)
    user.token_version += 1
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id).delete()
    record.used_at = datetime.now(timezone.utc)
    db.commit()
