"""trip_delivery_fields

Revision ID: c8f3a921b6d4
Revises: b4e91f2c7d03
Create Date: 2026-04-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "c8f3a921b6d4"
down_revision: Union[str, None] = "b4e91f2c7d03"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("delivery_number", sa.String(100), nullable=True))
    op.add_column("trips", sa.Column("stops_count", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "stops_count")
    op.drop_column("trips", "delivery_number")
