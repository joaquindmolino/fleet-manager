"""Schemas del panel de superadmin: gestión de tenants."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: Literal["trial", "basic", "pro", "enterprise"] = "trial"
    admin_email: EmailStr
    admin_nombre: str
    admin_password: str

    @field_validator("slug")
    @classmethod
    def slug_format(cls, v: str) -> str:
        return v.strip().lower().replace(" ", "-")[:50]

    @field_validator("admin_password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("La contraseña debe tener al menos 6 caracteres")
        return v


class TenantResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: str
    is_active: bool
    created_at: datetime
    user_count: int = 0

    model_config = {"from_attributes": True}
