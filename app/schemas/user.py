import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

_PASSWORD_RE = re.compile(r'^(?=.*[A-Z]|.*[0-9]|.*[^A-Za-z0-9]).{8,}$')


def _validate_password(v: str) -> str:
    if not _PASSWORD_RE.match(v):
        raise ValueError(
            "Password must be at least 8 characters and contain at least one "
            "uppercase letter, number, or symbol."
        )
    return v


class UserCreate(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str | None = Field(None, max_length=255)
    invite_token: str | None = Field(None, max_length=64)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, max_length=255)
    email: EmailStr | None = None


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    full_name: str | None
    is_active: bool
    is_approved: bool = False
    is_superadmin: bool = False
    created_at: datetime
    has_avatar: bool = False
    preferences: dict | None = None
    last_active_at: datetime | None = None

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)


class AccountDelete(BaseModel):
    password: str
