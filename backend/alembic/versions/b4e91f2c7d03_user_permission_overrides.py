"""user_permission_overrides

Revision ID: b4e91f2c7d03
Revises: 23b7d10a80c8
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b4e91f2c7d03'
down_revision: Union[str, None] = '23b7d10a80c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_permissions',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('permission_id', sa.UUID(), nullable=False),
        sa.Column('granted', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['permission_id'], ['permissions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'permission_id'),
    )


def downgrade() -> None:
    op.drop_table('user_permissions')
