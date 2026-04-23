import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegistrationInviteCreate(BaseModel):
    email: EmailStr | None = None
    note: str | None = Field(None, max_length=500)
    expires_in_days: int = Field(7, ge=1, le=365)


class RegistrationInviteResponse(BaseModel):
    id: uuid.UUID
    token: str
    email: str | None
    note: str | None
    expires_at: datetime
    used_at: datetime | None
    used_by: uuid.UUID | None
    created_at: datetime
    created_by: uuid.UUID | None

    model_config = {"from_attributes": True}


class RegistrationInvitePublic(BaseModel):
    """Returned by the public token-validation endpoint — no PII beyond email lock."""
    valid: bool
    email: str | None = None
    expired: bool = False
    used: bool = False


class PasswordResetUrlResponse(BaseModel):
    url: str
