"""trip_start_end_location

Revision ID: o0j1k2l3m4n5
Revises: n9i0j1k2l3m4
Create Date: 2026-05-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o0j1k2l3m4n5"
down_revision: Union[str, None] = "n9i0j1k2l3m4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("start_lat", sa.Float(), nullable=True))
    op.add_column("trips", sa.Column("start_lng", sa.Float(), nullable=True))
    op.add_column("trips", sa.Column("end_lat", sa.Float(), nullable=True))
    op.add_column("trips", sa.Column("end_lng", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("trips", "end_lng")
    op.drop_column("trips", "end_lat")
    op.drop_column("trips", "start_lng")
    op.drop_column("trips", "start_lat")
