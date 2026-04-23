"""add_registration_invites

Revision ID: f1d9e71b6b2e
Revises: 6c852fe80623
Create Date: 2026-04-23 00:17:11.916417

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1d9e71b6b2e'
down_revision: Union[str, Sequence[str], None] = '6c852fe80623'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('registration_invites',
        sa.Column('token', sa.String(length=64), nullable=False),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('email', sa.String(length=255), nullable=True),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_by', sa.Uuid(), nullable=True),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_registration_invites_created_by_users'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['used_by'], ['users.id'], name=op.f('fk_registration_invites_used_by_users'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_registration_invites'))
    )
    op.create_index(op.f('ix_registration_invites_token'), 'registration_invites', ['token'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_registration_invites_token'), table_name='registration_invites')
    op.drop_table('registration_invites')
