"""Modelos de configuración GPS y lecturas de telemetría."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, UUID, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class GpsConfig(Base, TimestampMixin):
    """
    Configuración del proveedor GPS para un tenant.
    Cada tenant puede tener su propia integración GPS (PowerFleet, u otro).
    """

    __tablename__ = "gps_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[str] = mapped_column(String(100), nullable=False)  # "powerfleet", "wialon", etc.
    api_url: Mapped[str | None] = mapped_column(String(500))
    api_key: Mapped[str | None] = mapped_column(Text)  # encriptado en producción
    # Configuración extra específica del proveedor (tokens, fleet IDs, etc.)
    extra_config: Mapped[dict | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="gps_configs")  # noqa: F821
    readings: Mapped[list["GpsReading"]] = relationship(back_populates="gps_config")


class GpsReading(Base):
    """Lectura de telemetría recibida del GPS de un vehículo."""

    __tablename__ = "gps_readings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gps_config_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gps_configs.id", ondelete="CASCADE"), nullable=False
    )
    latitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    longitude: Mapped[float | None] = mapped_column(Numeric(10, 7))
    speed: Mapped[int | None] = mapped_column(Integer)  # km/h
    odometer: Mapped[int | None] = mapped_column(Integer)  # km reportados por el GPS
    # Marca de tiempo reportada por el dispositivo GPS
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    # Payload completo del proveedor para auditoría
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="gps_readings")  # noqa: F821
    gps_config: Mapped[GpsConfig] = relationship(back_populates="readings")
