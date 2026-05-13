"""Add name column to trips.

Revision ID: r3m4n5o6p7q8
Revises: q2l3m4n5o6p7
Create Date: 2026-05-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r3m4n5o6p7q8"
down_revision: Union[str, None] = "q2l3m4n5o6p7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("name", sa.String(length=150), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "name")
