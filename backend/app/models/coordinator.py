"""Modelo de asignaciones de coordinador de viajes."""

import uuid

from sqlalchemy import ForeignKey, UniqueConstraint, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class CoordinatorAssignment(Base, TimestampMixin):
    """Vincula un usuario coordinador con los conductores de su equipo."""

    __tablename__ = "coordinator_assignments"
    __table_args__ = (
        UniqueConstraint("coordinator_user_id", "driver_id", name="uq_coordinator_driver"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    coordinator_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    driver_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False, index=True
    )
