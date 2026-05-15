"""Add backlog/approval fields to work_orders.

Revision ID: t5o6p7q8r9s0
Revises: s4n5o6p7q8r9
Create Date: 2026-05-15

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision: str = "t5o6p7q8r9s0"
down_revision: Union[str, None] = "s4n5o6p7q8r9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("work_orders", sa.Column("scheduled_date", sa.Date(), nullable=True))
    op.add_column(
        "work_orders",
        sa.Column(
            "approval_status",
            sa.String(length=50),
            server_default="pendiente",
            nullable=False,
        ),
    )
    op.add_column(
        "work_orders",
        sa.Column("approved_by", UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "work_orders",
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("work_orders", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column("work_orders", sa.Column("completed_date", sa.Date(), nullable=True))
    op.create_foreign_key(
        "fk_work_orders_approved_by_users",
        "work_orders",
        "users",
        ["approved_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_work_orders_approval_status",
        "work_orders",
        ["approval_status"],
    )
    op.create_index(
        "ix_work_orders_scheduled_date",
        "work_orders",
        ["scheduled_date"],
    )
    # Backfill: las órdenes existentes pasan a estar aprobadas para no romper el historial.
    op.execute("UPDATE work_orders SET approval_status = 'aprobada'")
    # Quitar el default para que las nuevas filas deban especificar el valor desde la app.
    op.alter_column("work_orders", "approval_status", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_work_orders_scheduled_date", table_name="work_orders")
    op.drop_index("ix_work_orders_approval_status", table_name="work_orders")
    op.drop_constraint("fk_work_orders_approved_by_users", "work_orders", type_="foreignkey")
    op.drop_column("work_orders", "completed_date")
    op.drop_column("work_orders", "rejection_reason")
    op.drop_column("work_orders", "approved_at")
    op.drop_column("work_orders", "approved_by")
    op.drop_column("work_orders", "approval_status")
    op.drop_column("work_orders", "scheduled_date")
