import uuid
from datetime import date, datetime, timezone

from sqlalchemy import String, Date, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Story(Base):
    __tablename__ = "stories"

    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    event_date: Mapped[date | None] = mapped_column(Date)
    event_end_date: Mapped[date | None] = mapped_column(Date)
    event_location: Mapped[str | None] = mapped_column(String(255))
    author_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    tree = relationship("Tree", back_populates="stories")
    author = relationship("User")
    person_links = relationship("StoryPerson", back_populates="story", cascade="all, delete-orphan")
    media_items = relationship("Media", back_populates="story", cascade="all, delete-orphan", passive_deletes=True)
    tag_links = relationship("StoryTag", back_populates="story", cascade="all, delete-orphan")


class StoryPerson(Base):
    __tablename__ = "story_persons"
    __table_args__ = (UniqueConstraint("story_id", "person_id"),)

    story_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), nullable=False
    )
    person_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("persons.id", ondelete="CASCADE"), nullable=False
    )

    story = relationship("Story", back_populates="person_links")
    person = relationship("Person", back_populates="story_links")


class StoryTag(Base):
    __tablename__ = "story_tags"
    __table_args__ = (UniqueConstraint("story_id", "tag_id"),)

    story_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), nullable=False
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), nullable=False
    )

    story = relationship("Story", back_populates="tag_links")
    tag = relationship("Tag", back_populates="story_links")
