import uuid
from datetime import datetime, timezone

from sqlalchemy import String, BigInteger, DateTime, ForeignKey, Text, CheckConstraint, event
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Media(Base):
    __tablename__ = "media"
    __table_args__ = (
        CheckConstraint(
            "media_type IN ('photo', 'audio', 'video', 'document', 'other')",
            name="valid_media_type",
        ),
    )

    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    story_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("stories.id", ondelete="CASCADE"), index=True
    )
    person_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("persons.id", ondelete="CASCADE"), index=True
    )
    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    media_type: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    caption: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    tree = relationship("Tree", back_populates="media_items")
    story = relationship("Story", back_populates="media_items")
    person = relationship("Person", back_populates="media_items", foreign_keys=[person_id])
    uploader = relationship("User")


@event.listens_for(Media, "after_delete")
def _cleanup_media_file(mapper, connection, target):
    from app.services.storage import resolve_path
    path = resolve_path(target.storage_path)
    if path.exists():
        path.unlink(missing_ok=True)
