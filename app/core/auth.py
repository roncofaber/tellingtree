import uuid

from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise UnauthorizedError("Invalid or expired token")

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Invalid token payload")

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise UnauthorizedError("Invalid token payload")

    user = db.query(User).filter(User.id == uid, User.is_active.is_(True)).first()
    if user is None:
        raise UnauthorizedError("User not found or inactive")

    token_ver = payload.get("ver", 0)
    if token_ver != user.token_version:
        raise UnauthorizedError("Token has been revoked")

    return user


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Dependency: caller must be a superadmin."""
    if not current_user.is_superadmin:
        raise ForbiddenError("Admin privileges required")
    return current_user
