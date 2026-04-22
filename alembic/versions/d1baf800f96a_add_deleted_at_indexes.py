"""add_deleted_at_indexes

Revision ID: d1baf800f96a
Revises: f664775c6c13
Create Date: 2026-04-22 16:19:53.490420

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'd1baf800f96a'
down_revision: Union[str, Sequence[str], None] = 'f664775c6c13'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_persons_deleted_at", "persons", ["deleted_at"])
    op.create_index("ix_stories_deleted_at", "stories", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_stories_deleted_at", table_name="stories")
    op.drop_index("ix_persons_deleted_at", table_name="persons")
