import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PlaceCreate(BaseModel):
    display_name: str = Field(..., max_length=500)
    city: str | None = Field(None, max_length=200)
    region: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=100)
    country_code: str | None = Field(None, max_length=2)
    lat: float | None = None
    lon: float | None = None


class PlaceUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=500)
    city: str | None = Field(None, max_length=200)
    region: str | None = Field(None, max_length=200)
    country: str | None = Field(None, max_length=100)
    country_code: str | None = Field(None, max_length=2)
    lat: float | None = None
    lon: float | None = None


class PlaceResponse(BaseModel):
    id: uuid.UUID
    display_name: str
    city: str | None
    region: str | None
    country: str | None
    country_code: str | None
    lat: float | None
    lon: float | None
    geocoder: str | None
    geocoded_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
