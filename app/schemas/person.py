import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field


class PersonCreate(BaseModel):
    given_name: str | None = Field(None, max_length=255)
    family_name: str | None = Field(None, max_length=255)
    maiden_name: str | None = Field(None, max_length=255)
    nickname: str | None = Field(None, max_length=100)
    birth_date: date | None = None
    birth_date_qualifier: str | None = Field(None, max_length=20)
    birth_date_2: date | None = None
    birth_date_original: str | None = Field(None, max_length=50)
    death_date: date | None = None
    death_date_qualifier: str | None = Field(None, max_length=20)
    death_date_2: date | None = None
    death_date_original: str | None = Field(None, max_length=50)
    birth_location: str | None = Field(None, max_length=255)
    birth_place_id: uuid.UUID | None = None
    death_location: str | None = Field(None, max_length=255)
    death_place_id: uuid.UUID | None = None
    gender: str | None = Field(None, max_length=50)
    is_living: bool | None = None
    occupation: str | None = Field(None, max_length=255)
    nationalities: list[str] | None = None
    education: str | None = None
    bio: str | None = None
    profile_picture_id: uuid.UUID | None = None


class PersonUpdate(BaseModel):
    given_name: str | None = Field(None, max_length=255)
    family_name: str | None = Field(None, max_length=255)
    maiden_name: str | None = Field(None, max_length=255)
    nickname: str | None = Field(None, max_length=100)
    birth_date: date | None = None
    birth_date_qualifier: str | None = Field(None, max_length=20)
    birth_date_2: date | None = None
    birth_date_original: str | None = Field(None, max_length=50)
    death_date: date | None = None
    death_date_qualifier: str | None = Field(None, max_length=20)
    death_date_2: date | None = None
    death_date_original: str | None = Field(None, max_length=50)
    birth_location: str | None = Field(None, max_length=255)
    birth_place_id: uuid.UUID | None = None
    death_location: str | None = Field(None, max_length=255)
    death_place_id: uuid.UUID | None = None
    gender: str | None = Field(None, max_length=50)
    is_living: bool | None = None
    occupation: str | None = Field(None, max_length=255)
    nationalities: list[str] | None = None
    education: str | None = None
    bio: str | None = None
    profile_picture_id: uuid.UUID | None = None


class PersonResponse(BaseModel):
    id: uuid.UUID
    tree_id: uuid.UUID
    given_name: str | None
    family_name: str | None
    maiden_name: str | None
    nickname: str | None
    birth_date: date | None
    birth_date_qualifier: str | None
    birth_date_2: date | None
    birth_date_original: str | None
    death_date: date | None
    death_date_qualifier: str | None
    death_date_2: date | None
    death_date_original: str | None
    birth_location: str | None
    birth_place_id: uuid.UUID | None
    death_location: str | None
    death_place_id: uuid.UUID | None
    gender: str | None
    is_living: bool | None
    occupation: str | None
    nationalities: list[str] | None
    education: str | None
    bio: str | None
    profile_picture_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
