"""add owner role to tree_members

Revision ID: 8a2840099b73
Revises: 113728a9ca98
Create Date: 2026-04-21 15:06:52.645759

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8a2840099b73'
down_revision: Union[str, Sequence[str], None] = '113728a9ca98'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("valid_role", "tree_members", type_="check")
    op.create_check_constraint("valid_role", "tree_members", "role IN ('viewer', 'editor', 'admin', 'owner')")
    # Add owner as member for existing trees
    op.execute("""
        INSERT INTO tree_members (id, tree_id, user_id, role, created_at)
        SELECT gen_random_uuid(), t.id, t.owner_id, 'owner', t.created_at
        FROM trees t
        WHERE NOT EXISTS (
            SELECT 1 FROM tree_members tm
            WHERE tm.tree_id = t.id AND tm.user_id = t.owner_id
        )
    """)


def downgrade() -> None:
    op.execute("DELETE FROM tree_members WHERE role = 'owner'")
    op.drop_constraint("valid_role", "tree_members", type_="check")
    op.create_check_constraint("valid_role", "tree_members", "role IN ('viewer', 'editor', 'admin')")
