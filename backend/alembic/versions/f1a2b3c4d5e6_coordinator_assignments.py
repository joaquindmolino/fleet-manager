"""coordinator_assignments

Revision ID: f1a2b3c4d5e6
Revises: a7d4e1f8b2c5
Create Date: 2026-04-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "a7d4e1f8b2c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "coordinator_assignments",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("coordinator_user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("driver_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["coordinator_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("coordinator_user_id", "driver_id", name="uq_coordinator_driver"),
    )
    op.create_index("ix_coordinator_assignments_tenant_id", "coordinator_assignments", ["tenant_id"])
    op.create_index("ix_coordinator_assignments_coordinator_user_id", "coordinator_assignments", ["coordinator_user_id"])
    op.create_index("ix_coordinator_assignments_driver_id", "coordinator_assignments", ["driver_id"])


def downgrade() -> None:
    op.drop_index("ix_coordinator_assignments_driver_id", "coordinator_assignments")
    op.drop_index("ix_coordinator_assignments_coordinator_user_id", "coordinator_assignments")
    op.drop_index("ix_coordinator_assignments_tenant_id", "coordinator_assignments")
    op.drop_table("coordinator_assignments")
