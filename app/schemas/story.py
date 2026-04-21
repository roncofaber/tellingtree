import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class StoryCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    content: str | None = None
    event_date: date | None = None
    event_end_date: date | None = None
    event_location: str | None = Field(None, max_length=255)
    person_ids: list[uuid.UUID] = Field(default_factory=list)
    tag_ids: list[uuid.UUID] = Field(default_factory=list)


class StoryUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=255)
    content: str | None = None
    event_date: date | None = None
    event_end_date: date | None = None
    event_location: str | None = Field(None, max_length=255)


class StoryResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    title: str
    content: str | None
    event_date: date | None
    event_end_date: date | None
    event_location: str | None
    author_id: uuid.UUID
    deleted_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    person_ids: list[uuid.UUID] = Field(default_factory=list)
    tag_ids: list[uuid.UUID] = Field(default_factory=list)

    model_config = {"from_attributes": True}
