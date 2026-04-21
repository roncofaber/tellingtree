"""add_osm_fields_to_places

Revision ID: 9c0d79a46570
Revises: 4406df5b773f
Branch Labels: None
Depends On: None

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9c0d79a46570'
down_revision: Union[str, Sequence[str], None] = '12c0fc3bb79c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('places', sa.Column('osm_id', sa.BigInteger(), nullable=True))
    op.add_column('places', sa.Column('osm_type', sa.String(length=10), nullable=True))
    op.add_column('places', sa.Column('place_type', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('places', 'place_type')
    op.drop_column('places', 'osm_type')
    op.drop_column('places', 'osm_id')
