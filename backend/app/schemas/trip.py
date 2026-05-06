"""Schemas de viaje."""

import uuid
from datetime import datetime
from pydantic import BaseModel, Field

from app.models.trip import EstadoViaje


class TripBase(BaseModel):
    origin: str = ""
    destination: str = ""
    start_odometer: int | None = None
    notes: str | None = None
    associated_document: str | None = None
    stops_count: int | None = None
    client_id: uuid.UUID | None = None
    scheduled_date: datetime | None = None


class TripCreate(TripBase):
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID | None = None
    start_time: datetime | None = None


class QuickTripCreate(BaseModel):
    """Carga rápida de reparto: el sistema auto-detecta chofer y vehículo."""
    associated_document: str | None = None
    stops_count: int | None = None
    start_odometer: int | None = None
    notes: str | None = None
    client_id: uuid.UUID | None = None
    scheduled_date: datetime | None = None


class TripUpdate(BaseModel):
    origin: str | None = None
    destination: str | None = None
    associated_document: str | None = None
    stops_count: int | None = None
    start_odometer: int | None = None
    client_id: uuid.UUID | None = None
    scheduled_date: datetime | None = None
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
    created_at: datetime

    model_config = {"from_attributes": True}


class TripStopCreate(BaseModel):
    lat: float
    lng: float
    accuracy: float | None = None
    notes: str | None = Field(None, max_length=300)
    timestamp: datetime


class TripStopResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    lat: float
    lng: float
    accuracy: float | None
    notes: str | None
    timestamp: datetime
    is_extra: bool
    created_at: datetime

    model_config = {"from_attributes": True}
