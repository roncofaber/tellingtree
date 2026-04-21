import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, Float, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Place(Base):
    __tablename__ = "places"

    display_name: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    city: Mapped[str | None] = mapped_column(String(200))
    region: Mapped[str | None] = mapped_column(String(200))
    country: Mapped[str | None] = mapped_column(String(100))
    country_code: Mapped[str | None] = mapped_column(String(2))
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    geocoder: Mapped[str | None] = mapped_column(String(50))
    geocoded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    osm_id: Mapped[int | None] = mapped_column(BigInteger)
    osm_type: Mapped[str | None] = mapped_column(String(10))
    place_type: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
