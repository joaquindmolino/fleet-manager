"""Modelo de cliente."""

import uuid

from sqlalchemy import ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class Client(Base, TimestampMixin):
    """Cliente al que se le prestan servicios de logística/distribución."""

    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    contact_name: Mapped[str | None] = mapped_column(String(200))
    contact_phone: Mapped[str | None] = mapped_column(String(50))
    contact_email: Mapped[str | None] = mapped_column(String(320))
    address: Mapped[str | None] = mapped_column(String(400))
    notes: Mapped[str | None] = mapped_column(Text)

    tenant: Mapped["Tenant"] = relationship(back_populates="clients")  # noqa: F821
    trips: Mapped[list["Trip"]] = relationship(back_populates="client")  # noqa: F821
