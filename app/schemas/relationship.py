import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class RelationshipCreate(BaseModel):
    person_a_id: uuid.UUID
    person_b_id: uuid.UUID
    relationship_type: str = Field(..., min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class RelationshipUpdate(BaseModel):
    relationship_type: str | None = Field(None, min_length=1, max_length=100)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class RelationshipResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    person_a_id: uuid.UUID
    person_b_id: uuid.UUID
    relationship_type: str
    start_date: date | None
    end_date: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
