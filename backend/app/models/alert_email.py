"""Modelo de emails adicionales para recibir alertas y notificaciones."""

import uuid

from sqlalchemy import Boolean, ForeignKey, String, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class AlertEmail(Base, TimestampMixin):
    """Email extra configurado por el tenant para recibir notificaciones."""

    __tablename__ = "alert_emails"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    label: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Tipos de notificación que recibe este email
    tipo_mantenimiento:    Mapped[bool] = mapped_column(Boolean, default=True,  nullable=False)
    tipo_resumen_viajes:   Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tipo_viaje_asignado:   Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tipo_viaje_iniciado:   Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tipo_viaje_completado: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
