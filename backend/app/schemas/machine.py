"""Schemas de máquina de depósito."""

import uuid
from pydantic import BaseModel

from app.models.machine import TipoMaquina, EstadoMaquina


class MachineBase(BaseModel):
    name: str
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    machine_type: TipoMaquina = TipoMaquina.AUTOELEVADOR_GASOIL
    serial_number: str | None = None
    notes: str | None = None


class MachineCreate(MachineBase):
    pass


class MachineUpdate(BaseModel):
    name: str | None = None
    brand: str | None = None
    model: str | None = None
    year: int | None = None
    machine_type: TipoMaquina | None = None
    status: EstadoMaquina | None = None
    hours_used: int | None = None
    assigned_user_id: uuid.UUID | None = None
    documents: dict | None = None
    notes: str | None = None


class MachineHoursUpdate(BaseModel):
    hours_used: int


class MachineResponse(MachineBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    status: EstadoMaquina
    hours_used: int
    assigned_user_id: uuid.UUID | None = None
    documents: dict | None = None

    model_config = {"from_attributes": True}
