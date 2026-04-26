"""Modelo de notificación y alerta del sistema."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class TipoNotificacion(str, Enum):
    VENCIMIENTO_SERVICE = "vencimiento_service"
    VENCIMIENTO_NEUMATICO = "vencimiento_neumatico"
    VENCIMIENTO_DOCUMENTO = "vencimiento_documento"
    VENCIMIENTO_LICENCIA = "vencimiento_licencia"
    ORDEN_TRABAJO = "orden_trabajo"
    PRESUPUESTO = "presupuesto"
    SISTEMA = "sistema"


class Notification(Base, TimestampMixin):
    """Notificación o alerta generada por el sistema para un usuario."""

    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    notification_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    # Entidad relacionada (ej: vehicle_id, tire_id, work_order_id)
    related_entity_type: Mapped[str | None] = mapped_column(String(100))
    related_entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    # Cuándo fue efectivamente enviada (push/email)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    tenant: Mapped["Tenant"] = relationship(back_populates="notifications")  # noqa: F821
    user: Mapped["User"] = relationship(back_populates="notifications")  # noqa: F821
