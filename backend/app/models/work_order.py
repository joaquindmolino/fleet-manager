"""Modelo de orden de trabajo."""

import uuid
from datetime import date, datetime
from enum import Enum

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class EstadoOrden(str, Enum):
    ABIERTA = "abierta"
    EN_PROGRESO = "en_progreso"
    COMPLETADA = "completada"
    CANCELADA = "cancelada"


class PrioridadOrden(str, Enum):
    BAJA = "baja"
    NORMAL = "normal"
    ALTA = "alta"
    URGENTE = "urgente"


class EstadoAprobacion(str, Enum):
    PENDIENTE = "pendiente"
    APROBADA = "aprobada"
    RECHAZADA = "rechazada"


class WorkOrder(Base, TimestampMixin):
    """Orden de trabajo para reparación o mantenimiento de vehículo o máquina."""

    __tablename__ = "work_orders"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Solo uno tiene valor (vehículo o máquina)
    vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Usuario responsable de la orden
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=EstadoOrden.ABIERTA, nullable=False, index=True)
    priority: Mapped[str] = mapped_column(String(50), default=PrioridadOrden.NORMAL, nullable=False)
    # Fecha en la que se planea hacer el trabajo (vs due_date, que es la fecha límite).
    scheduled_date: Mapped[date | None] = mapped_column(Date, index=True)
    due_date: Mapped[date | None] = mapped_column(Date)
    # Fecha en la que efectivamente se realizó el trabajo (puede diferir del completed_at timestamp).
    completed_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    notes: Mapped[str | None] = mapped_column(Text)

    # Flujo de aprobación (ortogonal a status).
    approval_status: Mapped[str] = mapped_column(
        String(50), default=EstadoAprobacion.PENDIENTE, nullable=False, index=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (
        CheckConstraint("num_nonnulls(vehicle_id, machine_id) = 1", name="ck_work_orders_vehicle_xor_machine"),
    )

    vehicle: Mapped["Vehicle | None"] = relationship(back_populates="work_orders")  # noqa: F821
    machine: Mapped["Machine | None"] = relationship(back_populates="work_orders")  # noqa: F821
    assigned_to_user: Mapped["User | None"] = relationship(
        back_populates="work_orders", foreign_keys=[assigned_to]
    )
    approver: Mapped["User | None"] = relationship(foreign_keys=[approved_by])  # noqa: F821
    quotes: Mapped[list["Quote"]] = relationship(back_populates="work_order")  # noqa: F821
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="work_order")  # noqa: F821
