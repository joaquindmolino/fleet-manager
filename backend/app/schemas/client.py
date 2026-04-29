"""Schemas de cliente."""

import uuid
from pydantic import BaseModel, EmailStr


class ClientBase(BaseModel):
    name: str
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    address: str | None = None
    notes: str | None = None


class ClientCreate(ClientBase):
    pass


class ClientUpdate(BaseModel):
    name: str | None = None
    contact_name: str | None = None
    contact_phone: str | None = None
    contact_email: EmailStr | None = None
    address: str | None = None
    notes: str | None = None


class ClientResponse(ClientBase):
    id: uuid.UUID
    tenant_id: uuid.UUID

    model_config = {"from_attributes": True}
