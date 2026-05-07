"""Modelos de services de mantenimiento e historial de intervenciones."""

import uuid
from datetime import date
from decimal import Decimal
from enum import Enum

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, Text, UUID, Date
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class AplicaA(str, Enum):
    VEHICULO = "vehiculo"    # todos los vehículos
    CAMION = "camion"        # solo camiones
    CAMIONETA = "camioneta"  # solo camionetas
    MAQUINA = "maquina"
    AMBOS = "ambos"          # vehículos + máquinas


class MaintenanceService(Base, TimestampMixin):
    """Definición de un service periódico (ej: cambio de aceite cada 10.000 km o 6 meses)."""

    __tablename__ = "maintenance_services"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    # Intervalo en kilómetros (vehículos)
    interval_km: Mapped[int | None] = mapped_column(Integer)
    # Intervalo en horas de uso (máquinas)
    interval_hours: Mapped[int | None] = mapped_column(Integer)
    # Intervalo en días (opcional, para ambos tipos)
    interval_days: Mapped[int | None] = mapped_column(Integer)
    applies_to: Mapped[str] = mapped_column(String(50), default=AplicaA.VEHICULO, nullable=False)

    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="service")


class MaintenanceRecord(Base, TimestampMixin):
    """Registro de una intervención de mantenimiento realizada."""

    __tablename__ = "maintenance_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Solo uno de los dos tiene valor (vehículo o máquina)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_services.id", ondelete="SET NULL"), nullable=True
    )
    driver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drivers.id", ondelete="SET NULL"), nullable=True
    )
    supplier_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("suppliers.id", ondelete="SET NULL"), nullable=True
    )
    work_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_orders.id", ondelete="SET NULL"), nullable=True
    )
    service_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    odometer_at_service: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    notes: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("num_nonnulls(vehicle_id, machine_id) = 1", name="ck_maintenance_records_vehicle_xor_machine"),
    )

    vehicle: Mapped["Vehicle | None"] = relationship(back_populates="maintenance_records")  # noqa: F821
    machine: Mapped["Machine | None"] = relationship(back_populates="maintenance_records")  # noqa: F821
    service: Mapped[MaintenanceService | None] = relationship(back_populates="maintenance_records")
    driver: Mapped["Driver | None"] = relationship(back_populates="maintenance_records")  # noqa: F821
    supplier: Mapped["Supplier | None"] = relationship(back_populates="maintenance_records")  # noqa: F821
    work_order: Mapped["WorkOrder | None"] = relationship(back_populates="maintenance_records")  # noqa: F821
