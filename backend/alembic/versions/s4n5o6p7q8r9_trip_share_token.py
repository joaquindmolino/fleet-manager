"""Add share_token column to trips for public route-sheet links.

Revision ID: s4n5o6p7q8r9
Revises: r3m4n5o6p7q8
Create Date: 2026-05-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "s4n5o6p7q8r9"
down_revision: Union[str, None] = "r3m4n5o6p7q8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trips", sa.Column("share_token", UUID(as_uuid=True), nullable=True))
    op.create_index("ix_trips_share_token", "trips", ["share_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_trips_share_token", table_name="trips")
    op.drop_column("trips", "share_token")
