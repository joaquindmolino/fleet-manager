"""Schemas del pool de ubicaciones pendientes."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class PoolLocationBase(BaseModel):
    alias: str | None = Field(None, max_length=100)
    address: str = Field(..., min_length=1, max_length=500)
    lat: float
    lng: float
    notes: str | None = None
    pin_color: str = Field("gray", max_length=20)


class PoolLocationCreate(PoolLocationBase):
    pass


class PoolLocationUpdate(BaseModel):
    alias: str | None = None
    notes: str | None = None
    pin_color: str | None = None


class PoolLocationResponse(PoolLocationBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class AssignToTripRequest(BaseModel):
    """Mueve ubicaciones del pool a un viaje. Se eliminan del pool."""
    location_ids: list[uuid.UUID] = Field(..., min_length=1)
