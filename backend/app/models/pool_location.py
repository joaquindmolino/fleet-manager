"""Pool de ubicaciones pendientes (bandeja de entregas sin asignar a viaje)."""

import uuid

from sqlalchemy import Float, ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, TimestampMixin


class PoolLocation(Base, TimestampMixin):
    """Ubicación en el pool del coordinador, todavía no asignada a ningún viaje.

    El pool es a nivel tenant: todos los coordinadores comparten la bandeja.
    Cuando una ubicación se asigna a un viaje, se mueve a `trip_planned_stops`
    y se elimina del pool. Si se desasigna, vuelve al pool.
    """

    __tablename__ = "pool_locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    alias: Mapped[str | None] = mapped_column(String(100), nullable=True)
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Color para identificación visual del pin (tipo de cliente, canal de venta, etc.)
    # No tiene relación con el viaje al que pertenezca. Valores: nombre de color del palette.
    pin_color: Mapped[str] = mapped_column(String(20), default="gray", nullable=False)
