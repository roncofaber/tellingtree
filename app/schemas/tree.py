import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TreeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    is_public: bool = False


class TreeUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    is_public: bool | None = None


class TreeResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    name: str
    slug: str
    description: str | None
    is_public: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TreeTransfer(BaseModel):
    new_owner_id: uuid.UUID


class TreeMemberCreate(BaseModel):
    username: str
    role: str = Field("viewer", pattern=r"^(viewer|editor|admin)$")


class TreeMemberUpdate(BaseModel):
    role: str = Field(..., pattern=r"^(viewer|editor|admin)$")


class TreeMemberResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    created_at: datetime
    username: str | None = None

    model_config = {"from_attributes": True}
