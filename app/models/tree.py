import re
import unicodedata
import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Boolean, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-") or "tree"


class Tree(Base):
    __tablename__ = "trees"

    owner_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(280), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(String, default=None)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    owner = relationship("User", back_populates="owned_trees")
    members = relationship("TreeMember", back_populates="tree", cascade="all, delete-orphan")
    persons = relationship("Person", back_populates="tree", cascade="all, delete-orphan")
    relationships = relationship("Relationship", back_populates="tree", cascade="all, delete-orphan")
    stories = relationship("Story", back_populates="tree", cascade="all, delete-orphan")
    media_items = relationship("Media", back_populates="tree", cascade="all, delete-orphan")
    tags = relationship("Tag", back_populates="tree", cascade="all, delete-orphan")


class TreeMember(Base):
    __tablename__ = "tree_members"
    __table_args__ = (
        UniqueConstraint("tree_id", "user_id"),
        CheckConstraint("role IN ('viewer', 'editor', 'admin', 'owner')", name="valid_role"),
    )

    tree_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("trees.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="viewer")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    tree = relationship("Tree", back_populates="members")
    user = relationship("User", back_populates="tree_memberships")
