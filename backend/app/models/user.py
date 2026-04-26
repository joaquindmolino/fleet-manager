"""Modelos de usuario, rol y permisos."""

import uuid
from enum import Enum

from sqlalchemy import Boolean, ForeignKey, String, Table, Column, UUID, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


# Tabla de asociación role <-> permission (many-to-many)
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", UUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)


class ModuloPermiso(str, Enum):
    FLOTA = "flota"
    MANTENIMIENTO = "mantenimiento"
    VIAJES = "viajes"
    PROVEEDORES = "proveedores"
    GPS = "gps"
    REPORTES = "reportes"
    USUARIOS = "usuarios"
    CONFIGURACION = "configuracion"


class AccionPermiso(str, Enum):
    VER = "ver"
    CREAR = "crear"
    EDITAR = "editar"
    APROBAR = "aprobar"
    CERRAR = "cerrar"
    ELIMINAR = "eliminar"


class Permission(Base):
    """Permiso granular: módulo + acción."""

    __tablename__ = "permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))

    roles: Mapped[list["Role"]] = relationship(secondary=role_permissions, back_populates="permissions")


class Role(Base, TimestampMixin):
    """Rol de usuario. Puede ser un rol de sistema o personalizado por el admin del tenant."""

    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(300))
    # Los roles de sistema (admin, encargado, etc.) no pueden eliminarse
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    permissions: Mapped[list[Permission]] = relationship(secondary=role_permissions, back_populates="roles")
    users: Mapped[list["User"]] = relationship(back_populates="role")


class User(Base, TimestampMixin):
    """Usuario del sistema. Pertenece a un tenant y tiene un rol."""

    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("roles.id", ondelete="SET NULL"), nullable=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Superadmin global (no pertenece a ningún tenant específico)
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="users")  # noqa: F821
    role: Mapped[Role | None] = relationship(back_populates="users")
    notifications: Mapped[list["Notification"]] = relationship(back_populates="user")  # noqa: F821
    work_orders: Mapped[list["WorkOrder"]] = relationship(back_populates="assigned_to_user")  # noqa: F821
