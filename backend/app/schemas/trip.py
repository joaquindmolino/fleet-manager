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
    status: EstadoViaje | None = None
    line_color: str | None = None
    planned_stops: list["TripPlannedStopInput"] | None = None


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
    line_color: str | None = None
    vehicle_id: uuid.UUID | None = None
    driver_id: uuid.UUID | None = None


class TripResponse(TripBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    vehicle_id: uuid.UUID
    driver_id: uuid.UUID | None
    end_odometer: int | None
    start_time: datetime | None
    end_time: datetime | None
    start_lat: float | None = None
    start_lng: float | None = None
    end_lat: float | None = None
    end_lng: float | None = None
    line_color: str | None = None
    status: EstadoViaje
    created_at: datetime

    model_config = {"from_attributes": True}


class TripStartBody(BaseModel):
    """Body opcional al iniciar un viaje: GPS de la ubicación de partida."""
    start_lat: float | None = None
    start_lng: float | None = None


class TripCompleteBody(BaseModel):
    """Body al finalizar un viaje: odómetro y GPS de fin (opcionales)."""
    end_odometer: int | None = None
    end_lat: float | None = None
    end_lng: float | None = None


class TripStopCreate(BaseModel):
    lat: float
    lng: float
    accuracy: float | None = None
    notes: str | None = Field(None, max_length=300)
    timestamp: datetime


class TripStopUpdate(BaseModel):
    notes: str | None = Field(None, max_length=300)


class TripPlannedStopBase(BaseModel):
    alias: str | None = Field(None, max_length=100)
    address: str = Field(..., min_length=1, max_length=500)
    lat: float
    lng: float
    service_minutes: int = Field(15, ge=0, le=480)
    notes: str | None = None
    pin_color: str = Field("gray", max_length=20)


class TripPlannedStopInput(TripPlannedStopBase):
    """Input al crear o reemplazar paradas planificadas (sin sequence, lo asigna el server)."""
    pass


class TripPlannedStopResponse(TripPlannedStopBase):
    id: uuid.UUID
    trip_id: uuid.UUID
    sequence: int

    model_config = {"from_attributes": True}


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
