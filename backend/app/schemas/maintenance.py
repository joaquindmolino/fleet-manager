"""Schemas de services de mantenimiento e historial."""

import uuid
from datetime import date
from decimal import Decimal
from pydantic import BaseModel

from app.models.maintenance import AplicaA


class MaintenanceServiceBase(BaseModel):
    name: str
    description: str | None = None
    interval_km: int | None = None
    interval_days: int | None = None
    applies_to: AplicaA = AplicaA.VEHICULO


class MaintenanceServiceCreate(MaintenanceServiceBase):
    pass


class MaintenanceServiceUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    interval_km: int | None = None
    interval_days: int | None = None
    applies_to: AplicaA | None = None


class MaintenanceServiceResponse(MaintenanceServiceBase):
    id: uuid.UUID
    tenant_id: uuid.UUID

    model_config = {"from_attributes": True}


class MaintenanceRecordBase(BaseModel):
    service_date: date
    odometer_at_service: int | None = None
    cost: Decimal | None = None
    notes: str | None = None


class MaintenanceRecordCreate(MaintenanceRecordBase):
    vehicle_id: uuid.UUID | None = None
    machine_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None
    work_order_id: uuid.UUID | None = None


class MaintenanceRecordUpdate(BaseModel):
    service_date: date | None = None
    odometer_at_service: int | None = None
    cost: Decimal | None = None
    notes: str | None = None
    vehicle_id: uuid.UUID | None = None
    machine_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None
    supplier_id: uuid.UUID | None = None


class MaintenanceRecordResponse(MaintenanceRecordBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    vehicle_id: uuid.UUID | None
    machine_id: uuid.UUID | None
    service_id: uuid.UUID | None
    driver_id: uuid.UUID | None
    supplier_id: uuid.UUID | None
    work_order_id: uuid.UUID | None

    model_config = {"from_attributes": True}
