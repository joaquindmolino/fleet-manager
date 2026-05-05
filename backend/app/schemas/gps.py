"""Schemas de configuración GPS y posiciones de vehículos."""

import uuid
from pydantic import BaseModel


class GpsConfigCreate(BaseModel):
    server_url: str
    username: str
    password: str


class GpsConfigResponse(BaseModel):
    id: uuid.UUID
    provider: str
    is_active: bool
    server_url: str | None
    username: str | None

    model_config = {"from_attributes": True}


class VehiclePositionResponse(BaseModel):
    powerfleet_id: str
    name: str
    license_plate: str | None
    make: str | None
    model: str | None
    latitude: float | None
    longitude: float | None
    speed: float | None
    direction: float | None
    ignition_on: bool | None
    odometer: float | None
    address: str | None
    last_update: str | None
    vehicle_id: str | None
