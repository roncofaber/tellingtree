"""add_user_approval_and_superadmin

Revision ID: 6c852fe80623
Revises: 14ca056e3ca2
Create Date: 2026-04-23 00:16:08.827215

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6c852fe80623'
down_revision: Union[str, Sequence[str], None] = '14ca056e3ca2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_approved', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('users', sa.Column('is_superadmin', sa.Boolean(), server_default='false', nullable=False))

    # Backfill: existing users predate the approval system → grant approval.
    # Oldest user becomes the bootstrap superadmin.
    op.execute("UPDATE users SET is_approved = true")
    op.execute("""
        UPDATE users SET is_superadmin = true
        WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
    """)


def downgrade() -> None:
    op.drop_column('users', 'is_superadmin')
    op.drop_column('users', 'is_approved')
