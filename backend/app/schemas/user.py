"""Schemas de usuario y rol."""

import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr


class PermissionResponse(BaseModel):
    id: uuid.UUID
    module: str
    action: str
    description: str | None

    model_config = {"from_attributes": True}


class RoleResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    description: str | None
    is_system: bool
    permissions: list[PermissionResponse] = []

    model_config = {"from_attributes": True}


class UserPermissionOverrideResponse(BaseModel):
    """Pydantic mapea module/action desde los @property del modelo UserPermission."""
    permission_id: uuid.UUID
    module: str
    action: str
    granted: bool

    model_config = {"from_attributes": True}


class UserResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    role_id: uuid.UUID | None
    email: EmailStr
    full_name: str
    is_active: bool
    is_superadmin: bool
    created_at: datetime | None = None
    role: RoleResponse | None = None
    permission_overrides: list[UserPermissionOverrideResponse] = []

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role_id: uuid.UUID | None = None


class UserUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    role_id: uuid.UUID | None = None
    is_active: bool | None = None


class UserPasswordChange(BaseModel):
    password: str


class UserPermissionOverrideSet(BaseModel):
    permission_id: uuid.UUID
    granted: bool


class UserPermissionsUpdate(BaseModel):
    overrides: list[UserPermissionOverrideSet]


class UserPickerResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    is_active: bool

    model_config = {"from_attributes": True}
