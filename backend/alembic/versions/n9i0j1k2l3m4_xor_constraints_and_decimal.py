"""XOR constraints vehicle/machine y tipo Decimal en costos.

Revision ID: n9i0j1k2l3m4
Revises: m8h9i0j1k2l3
Create Date: 2026-05-07

"""
from alembic import op

revision = "n9i0j1k2l3m4"
down_revision = "m8h9i0j1k2l3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Garantiza que cada registro tenga exactamente un FK (vehicle o machine), no ambos ni ninguno.
    op.create_check_constraint(
        "ck_maintenance_records_vehicle_xor_machine",
        "maintenance_records",
        "num_nonnulls(vehicle_id, machine_id) = 1",
    )
    op.create_check_constraint(
        "ck_work_orders_vehicle_xor_machine",
        "work_orders",
        "num_nonnulls(vehicle_id, machine_id) = 1",
    )
    op.create_check_constraint(
        "ck_fleet_assignments_vehicle_xor_machine",
        "fleet_assignments",
        "num_nonnulls(vehicle_id, machine_id) = 1",
    )


def downgrade() -> None:
    op.drop_constraint("ck_fleet_assignments_vehicle_xor_machine", "fleet_assignments", type_="check")
    op.drop_constraint("ck_work_orders_vehicle_xor_machine", "work_orders", type_="check")
    op.drop_constraint("ck_maintenance_records_vehicle_xor_machine", "maintenance_records", type_="check")
