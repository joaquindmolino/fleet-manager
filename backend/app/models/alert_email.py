"""Modelo de emails adicionales para recibir alertas de mantenimiento."""

import uuid

from sqlalchemy import ForeignKey, String, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class AlertEmail(Base, TimestampMixin):
    """Email extra configurado por el tenant para recibir alertas de mantenimiento."""

    __tablename__ = "alert_emails"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)
