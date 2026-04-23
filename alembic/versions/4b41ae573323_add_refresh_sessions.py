"""add_refresh_sessions

Revision ID: 4b41ae573323
Revises: f1d9e71b6b2e
Create Date: 2026-04-23 00:37:41.124030

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4b41ae573323'
down_revision: Union[str, Sequence[str], None] = 'f1d9e71b6b2e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('refresh_sessions',
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('jti', sa.String(length=64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_sessions_user_id_users'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_sessions'))
    )
    op.create_index(op.f('ix_refresh_sessions_jti'), 'refresh_sessions', ['jti'], unique=True)
    op.create_index(op.f('ix_refresh_sessions_user_id'), 'refresh_sessions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_refresh_sessions_user_id'), table_name='refresh_sessions')
    op.drop_index(op.f('ix_refresh_sessions_jti'), table_name='refresh_sessions')
    op.drop_table('refresh_sessions')
