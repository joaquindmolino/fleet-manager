"""notifications_table

Revision ID: i4d5e6f7g8h9
Revises: h3c4d5e6f7a8
Create Date: 2026-05-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision: str = "i4d5e6f7g8h9"
down_revision: Union[str, None] = "h3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "notifications" not in existing_tables:
        op.create_table(
            "notifications",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("tenant_id", UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("notification_type", sa.String(100), nullable=False),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("body", sa.Text, nullable=True),
            sa.Column("link", sa.String(300), nullable=True),
            sa.Column("related_entity_type", sa.String(100), nullable=True),
            sa.Column("related_entity_id", UUID(as_uuid=True), nullable=True),
            sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        )

    # Agregar columna link si la tabla existía sin ella
    existing_columns = {col["name"] for col in inspector.get_columns("notifications")}
    if "link" not in existing_columns:
        op.add_column("notifications", sa.Column("link", sa.String(300), nullable=True))

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("notifications")} if "notifications" in inspector.get_table_names() else set()
    for index_name, columns in [
        ("ix_notifications_tenant_id", ["tenant_id"]),
        ("ix_notifications_user_id", ["user_id"]),
        ("ix_notifications_is_read", ["is_read"]),
        ("ix_notifications_notification_type", ["notification_type"]),
    ]:
        if index_name not in existing_indexes:
            op.create_index(index_name, "notifications", columns)


def downgrade() -> None:
    op.drop_table("notifications")
