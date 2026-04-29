"""Modelo de tenant (empresa cliente del SaaS)."""

import uuid
from enum import Enum

from sqlalchemy import Boolean, String, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class PlanTenant(str, Enum):
    TRIAL = "trial"
    BASIC = "basic"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class Tenant(Base, TimestampMixin):
    """Empresa cliente. Raíz de todos los datos en el sistema."""

    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(50), default=PlanTenant.TRIAL, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Relaciones
    users: Mapped[list["User"]] = relationship(back_populates="tenant")  # noqa: F821
    vehicles: Mapped[list["Vehicle"]] = relationship(back_populates="tenant")  # noqa: F821
    machines: Mapped[list["Machine"]] = relationship(back_populates="tenant")  # noqa: F821
    drivers: Mapped[list["Driver"]] = relationship(back_populates="tenant")  # noqa: F821
    suppliers: Mapped[list["Supplier"]] = relationship(back_populates="tenant")  # noqa: F821
    clients: Mapped[list["Client"]] = relationship(back_populates="tenant")  # noqa: F821
    gps_configs: Mapped[list["GpsConfig"]] = relationship(back_populates="tenant")  # noqa: F821
    notifications: Mapped[list["Notification"]] = relationship(back_populates="tenant")  # noqa: F821
