"""pool_locations + colores en trips y planned_stops

Revision ID: q2l3m4n5o6p7
Revises: p1k2l3m4n5o6
Create Date: 2026-05-13

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "q2l3m4n5o6p7"
down_revision: Union[str, None] = "p1k2l3m4n5o6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tabla pool_locations
    op.create_table(
        "pool_locations",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", sa.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("alias", sa.String(100), nullable=True),
        sa.Column("address", sa.String(500), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("pin_color", sa.String(20), nullable=False, server_default="gray"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_pool_locations_tenant_id", "pool_locations", ["tenant_id"])

    # line_color en trips
    op.add_column("trips", sa.Column("line_color", sa.String(20), nullable=True))

    # notes + pin_color en trip_planned_stops
    op.add_column("trip_planned_stops", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("trip_planned_stops", sa.Column("pin_color", sa.String(20), nullable=False, server_default="gray"))


def downgrade() -> None:
    op.drop_column("trip_planned_stops", "pin_color")
    op.drop_column("trip_planned_stops", "notes")
    op.drop_column("trips", "line_color")
    op.drop_index("ix_pool_locations_tenant_id", table_name="pool_locations")
    op.drop_table("pool_locations")
