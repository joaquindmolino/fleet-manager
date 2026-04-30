"""Schemas de flota a cargo."""

import uuid
from pydantic import BaseModel


class FleetAssignmentsResponse(BaseModel):
    user_id: uuid.UUID
    vehicle_ids: list[uuid.UUID]
    machine_ids: list[uuid.UUID]


class SetFleetAssignments(BaseModel):
    vehicle_ids: list[uuid.UUID] = []
    machine_ids: list[uuid.UUID] = []
