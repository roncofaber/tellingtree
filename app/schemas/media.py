import uuid
from datetime import datetime

from pydantic import BaseModel


class MediaResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    story_id: uuid.UUID | None
    person_id: uuid.UUID | None
    uploaded_by_id: uuid.UUID
    filename: str
    original_filename: str
    mime_type: str
    size_bytes: int | None
    media_type: str
    caption: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
