"""Modelo de viaje (trip)."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UUID
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
    associated_document: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stops_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True, index=True
    )

    vehicle: Mapped["Vehicle"] = relationship(back_populates="trips")  # noqa: F821
    driver: Mapped["Driver | None"] = relationship(back_populates="trips")  # noqa: F821
    client: Mapped["Client | None"] = relationship(back_populates="trips")  # noqa: F821
    stops: Mapped[list["TripStop"]] = relationship(back_populates="trip", order_by="TripStop.timestamp")


class TripStop(Base, TimestampMixin):
    """Parada/entrega registrada durante un viaje con geolocalización."""

    __tablename__ = "trip_stops"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_extra: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    trip: Mapped["Trip"] = relationship(back_populates="stops")
