"""alert_emails_notification_types

Revision ID: l7g8h9i0j1k2
Revises: k6f7g8h9i0j1
Create Date: 2026-05-06 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'l7g8h9i0j1k2'
down_revision: Union[str, None] = 'k6f7g8h9i0j1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('alert_emails', sa.Column('tipo_mantenimiento',    sa.Boolean(), nullable=False, server_default='true'))
    op.add_column('alert_emails', sa.Column('tipo_resumen_viajes',   sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('alert_emails', sa.Column('tipo_viaje_asignado',   sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('alert_emails', sa.Column('tipo_viaje_iniciado',   sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('alert_emails', sa.Column('tipo_viaje_completado', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('alert_emails', 'tipo_viaje_completado')
    op.drop_column('alert_emails', 'tipo_viaje_iniciado')
    op.drop_column('alert_emails', 'tipo_viaje_asignado')
    op.drop_column('alert_emails', 'tipo_resumen_viajes')
    op.drop_column('alert_emails', 'tipo_mantenimiento')
