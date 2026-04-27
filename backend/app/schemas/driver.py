"""Schemas de chofer."""

import uuid
from datetime import date
from pydantic import BaseModel

from app.models.driver import EstadoChofer


class DriverBase(BaseModel):
    full_name: str
    license_number: str | None = None
    license_expiry: date | None = None
    phone: str | None = None
    notes: str | None = None


class DriverCreate(DriverBase):
    vehicle_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None


class DriverUpdate(BaseModel):
    full_name: str | None = None
    license_number: str | None = None
    license_expiry: date | None = None
    phone: str | None = None
    vehicle_id: uuid.UUID | None = None
    user_id: uuid.UUID | None = None
    status: EstadoChofer | None = None
    notes: str | None = None


class DriverResponse(DriverBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID | None
    vehicle_id: uuid.UUID | None
    status: EstadoChofer

    model_config = {"from_attributes": True}
