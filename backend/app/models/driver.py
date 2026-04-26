"""Modelo de chofer (driver)."""

import uuid
from datetime import date
from enum import Enum

from sqlalchemy import Date, ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class EstadoChofer(str, Enum):
    ACTIVO = "activo"
    INACTIVO = "inactivo"
    BAJA = "baja"


class Driver(Base, TimestampMixin):
    """Chofer. Puede estar vinculado a un usuario del sistema y asignado a un vehículo."""

    __tablename__ = "drivers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Un chofer puede tener cuenta de usuario en el sistema (opcional)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Vehículo asignado actualmente (puede ser nulo si está sin asignación)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    license_number: Mapped[str | None] = mapped_column(String(50), index=True)
    license_expiry: Mapped[date | None] = mapped_column(Date)
    phone: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(50), default=EstadoChofer.ACTIVO, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    tenant: Mapped["Tenant"] = relationship(back_populates="drivers")  # noqa: F821
    vehicle: Mapped["Vehicle | None"] = relationship(back_populates="drivers")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="driver")  # noqa: F821
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="driver")  # noqa: F821
