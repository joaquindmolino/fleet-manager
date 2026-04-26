"""Schemas de proveedor."""

import uuid
from pydantic import BaseModel, EmailStr

from app.models.supplier import RubroProveedor


class SupplierBase(BaseModel):
    name: str
    category: RubroProveedor = RubroProveedor.OTRO
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    tax_id: str | None = None
    notes: str | None = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: str | None = None
    category: RubroProveedor | None = None
    phone: str | None = None
    email: EmailStr | None = None
    address: str | None = None
    tax_id: str | None = None
    notes: str | None = None


class SupplierResponse(SupplierBase):
    id: uuid.UUID
    tenant_id: uuid.UUID

    model_config = {"from_attributes": True}
