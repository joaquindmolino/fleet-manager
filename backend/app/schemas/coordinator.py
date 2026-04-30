"""Schemas de asignaciones de coordinador."""

import uuid
from pydantic import BaseModel


class CoordinatorAssignmentsResponse(BaseModel):
    coordinator_user_id: uuid.UUID
    driver_ids: list[uuid.UUID]


class SetCoordinatorAssignments(BaseModel):
    driver_ids: list[uuid.UUID]
