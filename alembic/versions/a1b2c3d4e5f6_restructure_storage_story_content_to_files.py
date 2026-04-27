"""Restructure storage: media to images/, story content to files

Revision ID: a1b2c3d4e5f6
Revises: 4d4de387b5d8
Create Date: 2026-04-27 00:00:00.000000

"""
from pathlib import Path
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "4d4de387b5d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _storage_path() -> Path:
    from app.config import settings
    return Path(settings.storage_path)


def upgrade() -> None:
    # ── 1. Add content_path to stories ───────────────────────────────────────
    op.add_column("stories", sa.Column("content_path", sa.String(500), nullable=True))

    conn = op.get_bind()
    base = _storage_path()

    # ── 2. Migrate story content column → files ───────────────────────────────
    rows = conn.execute(sa.text(
        "SELECT id, tree_id, content FROM stories WHERE content IS NOT NULL"
    )).fetchall()
    for row in rows:
        rel = f"stories/{row.tree_id}/{row.id}.json"
        full = base / rel
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(row.content, encoding="utf-8")
        conn.execute(sa.text(
            "UPDATE stories SET content_path = :path WHERE id = :id"
        ), {"path": rel, "id": str(row.id)})

    # ── 3. Drop content column ────────────────────────────────────────────────
    op.drop_column("stories", "content")

    # ── 4. Move media files from {tree_id}/ to images/{tree_id}/ ─────────────
    media_rows = conn.execute(sa.text(
        "SELECT id, storage_path FROM media "
        "WHERE storage_path NOT LIKE 'images/%' AND storage_path NOT LIKE 'avatars/%'"
    )).fetchall()
    for m in media_rows:
        old_rel = m.storage_path
        new_rel = f"images/{old_rel}"
        old_path = base / old_rel
        new_path = base / new_rel
        if old_path.exists():
            new_path.parent.mkdir(parents=True, exist_ok=True)
            old_path.rename(new_path)
        conn.execute(sa.text(
            "UPDATE media SET storage_path = :new WHERE id = :id"
        ), {"new": new_rel, "id": str(m.id)})


def downgrade() -> None:
    # ── 1. Restore content column ─────────────────────────────────────────────
    op.add_column("stories", sa.Column("content", sa.Text(), nullable=True))

    conn = op.get_bind()
    base = _storage_path()

    # ── 2. Read files back into DB ────────────────────────────────────────────
    rows = conn.execute(sa.text(
        "SELECT id, content_path FROM stories WHERE content_path IS NOT NULL"
    )).fetchall()
    for row in rows:
        full = base / row.content_path
        if full.exists():
            content = full.read_text(encoding="utf-8")
            conn.execute(sa.text(
                "UPDATE stories SET content = :c WHERE id = :id"
            ), {"c": content, "id": str(row.id)})

    op.drop_column("stories", "content_path")

    # ── 3. Move media files back from images/{tree_id}/ to {tree_id}/ ─────────
    media_rows = conn.execute(sa.text(
        "SELECT id, storage_path FROM media WHERE storage_path LIKE 'images/%'"
    )).fetchall()
    for m in media_rows:
        new_rel = m.storage_path[len("images/"):]
        old_path = base / m.storage_path
        new_path = base / new_rel
        if old_path.exists():
            new_path.parent.mkdir(parents=True, exist_ok=True)
            old_path.rename(new_path)
        conn.execute(sa.text(
            "UPDATE media SET storage_path = :new WHERE id = :id"
        ), {"new": new_rel, "id": str(m.id)})
