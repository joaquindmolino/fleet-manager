"""clients_and_trip_refactor

Revision ID: e3f7c2d8a1b9
Revises: c8f3a921b6d4
Create Date: 2026-04-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e3f7c2d8a1b9"
down_revision: Union[str, None] = "c8f3a921b6d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "clients",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("contact_name", sa.String(length=200), nullable=True),
        sa.Column("contact_phone", sa.String(length=50), nullable=True),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("address", sa.String(length=400), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_clients_tenant_id"), "clients", ["tenant_id"], unique=False)
    op.create_index(op.f("ix_clients_name"), "clients", ["name"], unique=False)

    op.alter_column("trips", "delivery_number", new_column_name="associated_document")

    op.add_column("trips", sa.Column("client_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_trips_client_id", "trips", "clients", ["client_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(op.f("ix_trips_client_id"), "trips", ["client_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_trips_client_id"), table_name="trips")
    op.drop_constraint("fk_trips_client_id", "trips", type_="foreignkey")
    op.drop_column("trips", "client_id")

    op.alter_column("trips", "associated_document", new_column_name="delivery_number")

    op.drop_index(op.f("ix_clients_name"), table_name="clients")
    op.drop_index(op.f("ix_clients_tenant_id"), table_name="clients")
    op.drop_table("clients")
