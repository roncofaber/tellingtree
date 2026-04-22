"""add_slug_to_trees

Revision ID: f664775c6c13
Revises: 55876b9a0490
Create Date: 2026-04-21 16:45:49.193939

"""
import re
import unicodedata
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f664775c6c13'
down_revision: Union[str, Sequence[str], None] = '55876b9a0490'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[-\s]+", "-", text)
    return text.strip("-") or "tree"


def upgrade() -> None:
    op.add_column('trees', sa.Column('slug', sa.String(length=280), nullable=True))

    conn = op.get_bind()
    trees = conn.execute(sa.text("SELECT id, name FROM trees")).fetchall()
    used_slugs: set[str] = set()
    for tree_id, name in trees:
        base = _slugify(name)
        slug = base
        suffix = 2
        while slug in used_slugs:
            slug = f"{base}-{suffix}"
            suffix += 1
        used_slugs.add(slug)
        conn.execute(sa.text("UPDATE trees SET slug = :slug WHERE id = :id"), {"slug": slug, "id": tree_id})

    op.alter_column('trees', 'slug', nullable=False)
    op.create_index(op.f('ix_trees_slug'), 'trees', ['slug'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_trees_slug'), table_name='trees')
    op.drop_column('trees', 'slug')
