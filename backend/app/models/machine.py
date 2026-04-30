"""Modelo de máquina de depósito (autoelevador, apilador, etc.)."""

import uuid
from enum import Enum

from sqlalchemy import ForeignKey, Integer, String, Text, UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class TipoMaquina(str, Enum):
    AUTOELEVADOR_GASOIL = "autoelevador_gasoil"
    APILADOR_ELECTRICO = "apilador_electrico"
    OTRO = "otro"


class EstadoMaquina(str, Enum):
    ACTIVO = "activo"
    EN_SERVICIO = "en_servicio"
    BAJA = "baja"


class Machine(Base, TimestampMixin):
    """Máquina de depósito. Similar al vehículo pero sin odómetro ni chofer asignado."""

    __tablename__ = "machines"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    brand: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    year: Mapped[int | None] = mapped_column(Integer)
    machine_type: Mapped[str] = mapped_column(String(50), default=TipoMaquina.AUTOELEVADOR_GASOIL, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=EstadoMaquina.ACTIVO, nullable=False, index=True)
    serial_number: Mapped[str | None] = mapped_column(String(100), index=True)
    # Horas de uso como alternativa al odómetro para máquinas
    hours_used: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    documents: Mapped[dict | None] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text)

    # Operario de depósito asignado a esta máquina (opcional)
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    tenant: Mapped["Tenant"] = relationship(back_populates="machines")  # noqa: F821
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="machine")  # noqa: F821
    work_orders: Mapped[list["WorkOrder"]] = relationship(back_populates="machine")  # noqa: F821
