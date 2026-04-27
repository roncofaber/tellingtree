"""nullable tree_id on notifications

Revision ID: 0c7b2710106b
Revises: da9cf9f67464
Create Date: 2026-04-24 23:44:33.548852

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0c7b2710106b'
down_revision: Union[str, Sequence[str], None] = 'da9cf9f67464'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('notifications', 'tree_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column('notifications', 'tree_id', existing_type=sa.UUID(), nullable=False)
