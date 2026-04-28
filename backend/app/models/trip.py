"""Modelo de viaje (trip)."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class EstadoViaje(str, Enum):
    PLANIFICADO = "planificado"
    EN_CURSO = "en_curso"
    COMPLETADO = "completado"
    CANCELADO = "cancelado"


class Trip(Base, TimestampMixin):
    """Viaje registrado. Al completarse actualiza el odómetro del vehículo."""

    __tablename__ = "trips"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    origin: Mapped[str] = mapped_column(String(300), nullable=False)
    destination: Mapped[str] = mapped_column(String(300), nullable=False)
    start_odometer: Mapped[int | None] = mapped_column(Integer)
    end_odometer: Mapped[int | None] = mapped_column(Integer)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(50), default=EstadoViaje.PLANIFICADO, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)
    delivery_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stops_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="trips")  # noqa: F821
    driver: Mapped["Driver | None"] = relationship(back_populates="trips")  # noqa: F821
