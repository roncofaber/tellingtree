from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt, JWTError

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(subject: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_access_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expire, "type": "access", "ver": token_version}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, token_version: int = 0, jti: str = "") -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.jwt_refresh_token_expire_minutes
    )
    payload = {"sub": subject, "exp": expire, "type": "refresh", "ver": token_version, "jti": jti}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        return None
