"""Schemas de vehículo."""

import uuid
from pydantic import BaseModel

from app.models.vehicle import TipoVehiculo, EstadoVehiculo


class VehicleBase(BaseModel):
    plate: str
    brand: str
    model: str
    year: int | None = None
    vehicle_type: TipoVehiculo = TipoVehiculo.CAMION
    notes: str | None = None


class VehicleCreate(VehicleBase):
    pass


class VehicleUpdate(BaseModel):
    plate: str | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    vehicle_type: TipoVehiculo | None = None
    status: EstadoVehiculo | None = None
    odometer: int | None = None
    documents: dict | None = None
    notes: str | None = None


class VehicleResponse(VehicleBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    status: EstadoVehiculo
    odometer: int
    documents: dict | None = None

    model_config = {"from_attributes": True}
