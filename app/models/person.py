import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Person(Base):
    __tablename__ = "persons"

    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    given_name: Mapped[str | None] = mapped_column(String(500))
    family_name: Mapped[str | None] = mapped_column(String(500))
    maiden_name: Mapped[str | None] = mapped_column(String(500))
    nickname: Mapped[str | None] = mapped_column(String(255))
    birth_date: Mapped[date | None] = mapped_column(Date)
    birth_date_qualifier: Mapped[str | None] = mapped_column(String(20))
    birth_date_2: Mapped[date | None] = mapped_column(Date)
    birth_date_original: Mapped[str | None] = mapped_column(String(255))
    death_date: Mapped[date | None] = mapped_column(Date)
    death_date_qualifier: Mapped[str | None] = mapped_column(String(20))
    death_date_2: Mapped[date | None] = mapped_column(Date)
    death_date_original: Mapped[str | None] = mapped_column(String(255))
    birth_location: Mapped[str | None] = mapped_column(String(255))
    birth_place_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("places.id", ondelete="SET NULL"), index=True
    )
    death_location: Mapped[str | None] = mapped_column(String(255))
    death_place_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("places.id", ondelete="SET NULL"), index=True
    )
    gender: Mapped[str | None] = mapped_column(String(50))
    is_living: Mapped[bool | None] = mapped_column(Boolean)
    occupation: Mapped[str | None] = mapped_column(String(255))
    nationalities: Mapped[list | None] = mapped_column(JSON)
    education: Mapped[str | None] = mapped_column(Text)
    bio: Mapped[str | None] = mapped_column(Text)
    profile_picture_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("media.id", ondelete="SET NULL", use_alter=True,
                   name="fk_persons_profile_picture_id_media"),
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    tree = relationship("Tree", back_populates="persons")
    story_links = relationship("StoryPerson", back_populates="person", cascade="all, delete-orphan")
    media_items = relationship("Media", back_populates="person", cascade="all, delete-orphan", passive_deletes=True, foreign_keys="[Media.person_id]")
