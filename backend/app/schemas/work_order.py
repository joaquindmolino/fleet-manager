"""Schemas de orden de trabajo."""

import uuid
from datetime import date
from pydantic import BaseModel

from app.models.work_order import EstadoOrden, PrioridadOrden


class WorkOrderBase(BaseModel):
    description: str
    priority: PrioridadOrden = PrioridadOrden.NORMAL
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
    due_date: date | None = None
    assigned_to: uuid.UUID | None = None
    notes: str | None = None


class WorkOrderResponse(WorkOrderBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    vehicle_id: uuid.UUID | None
    machine_id: uuid.UUID | None
    assigned_to: uuid.UUID | None
    status: EstadoOrden

    model_config = {"from_attributes": True}
