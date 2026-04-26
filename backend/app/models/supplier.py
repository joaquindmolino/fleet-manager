"""Modelo de proveedor de servicios."""

import uuid
from enum import Enum

from sqlalchemy import ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class RubroProveedor(str, Enum):
    MECANICA = "mecanica"
    ELECTRICIDAD = "electricidad"
    NEUMATICOS = "neumaticos"
    REPUESTOS = "repuestos"
    CARROCERIA = "carroceria"
    LUBRICANTES = "lubricantes"
    GPS = "gps"
    OTRO = "otro"


class Supplier(Base, TimestampMixin):
    """Proveedor de servicios de mantenimiento o repuestos."""

    __tablename__ = "suppliers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(100), default=RubroProveedor.OTRO, nullable=False, index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(320))
    address: Mapped[str | None] = mapped_column(String(400))
    tax_id: Mapped[str | None] = mapped_column(String(50))  # CUIT
    notes: Mapped[str | None] = mapped_column(Text)

    tenant: Mapped["Tenant"] = relationship(back_populates="suppliers")  # noqa: F821
    quotes: Mapped[list["Quote"]] = relationship(back_populates="supplier")  # noqa: F821
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(back_populates="supplier")  # noqa: F821
