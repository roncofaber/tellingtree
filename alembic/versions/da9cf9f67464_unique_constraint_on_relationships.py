"""unique constraint on relationships

Revision ID: da9cf9f67464
Revises: 4882c20a9f87
Create Date: 2026-04-23 23:45:04.600916

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da9cf9f67464'
down_revision: Union[str, Sequence[str], None] = '4882c20a9f87'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint('uq_relationship', 'relationships', ['tree_id', 'person_a_id', 'person_b_id', 'relationship_type'])


def downgrade() -> None:
    op.drop_constraint('uq_relationship', 'relationships', type_='unique')
