"""Schemas de orden de trabajo."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel

from app.models.work_order import EstadoAprobacion, EstadoOrden, PrioridadOrden


class WorkOrderBase(BaseModel):
    description: str
    priority: PrioridadOrden = PrioridadOrden.NORMAL
    scheduled_date: date | None = None
    due_date: date | None = None
    notes: str | None = None


class WorkOrderCreate(WorkOrderBase):
    vehicle_id: uuid.UUID | None = None
    machine_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None


class WorkOrderUpdate(BaseModel):
    description: str | None = None
    status: EstadoOrden | None = None
    priority: PrioridadOrden | None = None
    scheduled_date: date | None = None
    due_date: date | None = None
    assigned_to: uuid.UUID | None = None
    notes: str | None = None


class WorkOrderApprove(BaseModel):
    """Sin cuerpo: aprueba la orden con el usuario actual."""


class WorkOrderReject(BaseModel):
    reason: str | None = None


class WorkOrderCancel(BaseModel):
    reason: str | None = None


class WorkOrderComplete(BaseModel):
    """Datos para marcar como realizada y crear el registro de historial."""
    completed_date: date | None = None
    odometer_at_service: int | None = None
    cost: Decimal | None = None
    supplier_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    notes: str | None = None


class WorkOrderResponse(WorkOrderBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    vehicle_id: uuid.UUID | None
    machine_id: uuid.UUID | None
    assigned_to: uuid.UUID | None
    status: EstadoOrden
    approval_status: EstadoAprobacion
    approved_by: uuid.UUID | None = None
    approved_at: datetime | None = None
    rejection_reason: str | None = None
    completed_date: date | None = None
    completed_at: datetime | None = None
    # Campos hidratados para no obligar al frontend a hacer joins.
    vehicle_plate: str | None = None
    machine_name: str | None = None
    assigned_to_name: str | None = None
    approved_by_name: str | None = None

    model_config = {"from_attributes": True}
