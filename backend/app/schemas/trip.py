"""Schemas de viaje."""

import uuid
from datetime import datetime
from pydantic import BaseModel

from app.models.trip import EstadoViaje


class TripBase(BaseModel):
    origin: str
    destination: str
    start_odometer: int | None = None
    notes: str | None = None


class TripCreate(TripBase):
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID | None = None
    start_time: datetime | None = None


class TripUpdate(BaseModel):
    origin: str | None = None
    destination: str | None = None
    end_odometer: int | None = None
    end_time: datetime | None = None
    status: EstadoViaje | None = None
    notes: str | None = None


class TripResponse(TripBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID | None
    end_odometer: int | None
    start_time: datetime | None
    end_time: datetime | None
    status: EstadoViaje

    model_config = {"from_attributes": True}
