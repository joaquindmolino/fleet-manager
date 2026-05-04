"""Schemas Pydantic para notificaciones."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    notification_type: str
    title: str
    body: str | None
    link: str | None
    related_entity_type: str | None
    related_entity_id: uuid.UUID | None
    is_read: bool
    sent_at: datetime | None
    created_at: datetime


class UnreadCountResponse(BaseModel):
    count: int
