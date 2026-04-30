"""fleet_assignments y assigned_user_id en machines

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "g2b3c4d5e6f7"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Operario asignado a máquina
    op.add_column("machines", sa.Column("assigned_user_id", sa.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_machines_assigned_user_id",
        "machines", "users",
        ["assigned_user_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_machines_assigned_user_id", "machines", ["assigned_user_id"])

    # Flota a cargo
    op.create_table(
        "fleet_assignments",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("vehicle_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("machine_id", sa.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["machine_id"], ["machines.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fleet_assignments_tenant_id", "fleet_assignments", ["tenant_id"])
    op.create_index("ix_fleet_assignments_user_id", "fleet_assignments", ["user_id"])
    op.create_index("ix_fleet_assignments_vehicle_id", "fleet_assignments", ["vehicle_id"])
    op.create_index("ix_fleet_assignments_machine_id", "fleet_assignments", ["machine_id"])


def downgrade() -> None:
    op.drop_index("ix_fleet_assignments_machine_id", "fleet_assignments")
    op.drop_index("ix_fleet_assignments_vehicle_id", "fleet_assignments")
    op.drop_index("ix_fleet_assignments_user_id", "fleet_assignments")
    op.drop_index("ix_fleet_assignments_tenant_id", "fleet_assignments")
    op.drop_table("fleet_assignments")

    op.drop_index("ix_machines_assigned_user_id", "machines")
    op.drop_constraint("fk_machines_assigned_user_id", "machines", type_="foreignkey")
    op.drop_column("machines", "assigned_user_id")
