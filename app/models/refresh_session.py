import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshSession(Base):
    """One row per active refresh token (= one logged-in device).

    The refresh token's `jti` claim references this row. On every refresh we
    generate a new jti and update this row in place — implementing rotation.
    If a presented jti can't be found (replay attempt with a stolen, already-rotated
    token), we treat it as a leak and bump the user's token_version, killing every
    session for that user.
    """
    __tablename__ = "refresh_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
