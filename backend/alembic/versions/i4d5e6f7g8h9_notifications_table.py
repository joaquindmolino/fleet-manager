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

_TABLE = "notifications"


def _table_exists(conn) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = :t)"
    ), {"t": _TABLE})
    return result.scalar()


def _column_exists(conn, column: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = :c)"
    ), {"t": _TABLE, "c": column})
    return result.scalar()


def _index_exists(conn, index: str) -> bool:
    result = conn.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = :t AND indexname = :i)"
    ), {"t": _TABLE, "i": index})
    return result.scalar()


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn):
        op.create_table(
            _TABLE,
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
    else:
        if not _column_exists(conn, "link"):
            op.add_column(_TABLE, sa.Column("link", sa.String(300), nullable=True))

    for index_name, columns in [
        ("ix_notifications_tenant_id", ["tenant_id"]),
        ("ix_notifications_user_id", ["user_id"]),
        ("ix_notifications_is_read", ["is_read"]),
        ("ix_notifications_notification_type", ["notification_type"]),
    ]:
        if not _index_exists(conn, index_name):
            op.create_index(index_name, _TABLE, columns)


def downgrade() -> None:
    op.drop_table(_TABLE)
