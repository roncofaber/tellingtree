"""add_user_avatar_path

Revision ID: 14ca056e3ca2
Revises: defb36db9bcf
Create Date: 2026-04-22 22:49:14.295344

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '14ca056e3ca2'
down_revision: Union[str, Sequence[str], None] = 'defb36db9bcf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_path', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_path')
