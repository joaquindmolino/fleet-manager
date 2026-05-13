"""trip_planned_stops

Revision ID: p1k2l3m4n5o6
Revises: o0j1k2l3m4n5
Create Date: 2026-05-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p1k2l3m4n5o6"
down_revision: Union[str, None] = "o0j1k2l3m4n5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trip_planned_stops",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("trip_id", sa.UUID(as_uuid=True), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("alias", sa.String(100), nullable=True),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("service_minutes", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_trip_planned_stops_tenant_id", "trip_planned_stops", ["tenant_id"])
    op.create_index("ix_trip_planned_stops_trip_id", "trip_planned_stops", ["trip_id"])


def downgrade() -> None:
    op.drop_index("ix_trip_planned_stops_trip_id", table_name="trip_planned_stops")
    op.drop_index("ix_trip_planned_stops_tenant_id", table_name="trip_planned_stops")
    op.drop_table("trip_planned_stops")
