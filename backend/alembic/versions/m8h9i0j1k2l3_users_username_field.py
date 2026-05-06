"""users_username_field

Revision ID: m8h9i0j1k2l3
Revises: l7g8h9i0j1k2
Create Date: 2026-05-06 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'm8h9i0j1k2l3'
down_revision: Union[str, None] = 'l7g8h9i0j1k2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Agregar username como nullable para hacer el backfill primero
    op.add_column('users', sa.Column('username', sa.String(150), nullable=True))

    # Backfill: usar el email existente como username
    op.execute("UPDATE users SET username = email")

    # Ahora sí, hacer NOT NULL y agregar índice único por tenant
    op.alter_column('users', 'username', nullable=False)
    op.create_index('ix_users_tenant_username', 'users', ['tenant_id', 'username'], unique=True)

    # Hacer email nullable (era el campo de login, ahora es contacto opcional)
    op.alter_column('users', 'email', existing_type=sa.String(320), nullable=True)


def downgrade() -> None:
    # Revertir email a NOT NULL (rellenar nulls antes)
    op.execute("UPDATE users SET email = username WHERE email IS NULL")
    op.alter_column('users', 'email', existing_type=sa.String(320), nullable=False)

    op.drop_index('ix_users_tenant_username', table_name='users')
    op.drop_column('users', 'username')
