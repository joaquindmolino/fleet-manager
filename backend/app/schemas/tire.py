"""Schemas de neumático."""

import uuid
from pydantic import BaseModel

from app.models.tire import EstadoNeumatico


class TireBase(BaseModel):
    position: str
    axle: int | None = None
    brand: str | None = None
    model: str | None = None
    size: str | None = None
    serial_number: str | None = None
    km_at_install: int = 0
    km_limit: int | None = None
    notes: str | None = None


class TireCreate(TireBase):
    vehicle_id: uuid.UUID


class TireUpdate(BaseModel):
    position: str | None = None
    km_limit: int | None = None
    current_km: int | None = None
    status: EstadoNeumatico | None = None
    notes: str | None = None


class TireResponse(TireBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    vehicle_id: uuid.UUID
    current_km: int
    status: EstadoNeumatico

    model_config = {"from_attributes": True}
