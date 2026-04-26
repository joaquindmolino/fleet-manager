"""Modelo de vehículo (camión, camioneta, auto)."""

import uuid
from enum import Enum

from sqlalchemy import ForeignKey, Integer, Numeric, String, Text, UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class TipoVehiculo(str, Enum):
    CAMION = "camion"
    CAMIONETA = "camioneta"
    AUTO = "auto"
    OTRO = "otro"


class EstadoVehiculo(str, Enum):
    ACTIVO = "activo"
    EN_SERVICIO = "en_servicio"
    BAJA = "baja"


class Vehicle(Base, TimestampMixin):
    """Vehículo de la flota. Tiene odómetro, documentación y puede tener choferes asignados."""

    __tablename__ = "vehicles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    plate: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer)
    vehicle_type: Mapped[str] = mapped_column(String(50), default=TipoVehiculo.CAMION, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=EstadoVehiculo.ACTIVO, nullable=False, index=True)
    odometer: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Documentación: VTV, seguro, habilitación, etc. (campo JSON flexible)
    documents: Mapped[dict | None] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text)

    tenant: Mapped["Tenant"] = relationship(back_populates="vehicles")  # noqa: F821
    drivers: Mapped[list["Driver"]] = relationship(back_populates="vehicle")  # noqa: F821
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="vehicle")  # noqa: F821
    tires: Mapped[list["Tire"]] = relationship(back_populates="vehicle")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="vehicle")  # noqa: F821
    gps_readings: Mapped[list["GpsReading"]] = relationship(back_populates="vehicle")  # noqa: F821
    work_orders: Mapped[list["WorkOrder"]] = relationship(back_populates="vehicle")  # noqa: F821
