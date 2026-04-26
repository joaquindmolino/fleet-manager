"""Modelo de neumático con control de km por posición/eje."""

import uuid
from enum import Enum

from sqlalchemy import ForeignKey, Integer, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, TimestampMixin


class EstadoNeumatico(str, Enum):
    EN_USO = "en_uso"
    EN_STOCK = "en_stock"
    REENCAUCHADO = "reencauchado"
    DESCARTADO = "descartado"


class Tire(Base, TimestampMixin):
    """
    Neumático montado en una posición/eje de un vehículo.
    Cuando se rota o reemplaza, el registro anterior queda como histórico y
    se crea uno nuevo con km_at_install actualizado.
    """

    __tablename__ = "tires"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Posición: ej. "eje1_izq", "eje2_der_ext", "repuesto"
    position: Mapped[str] = mapped_column(String(50), nullable=False)
    # Eje numérico para ordenamiento (1 = delantero)
    axle: Mapped[int | None] = mapped_column(Integer)
    brand: Mapped[str | None] = mapped_column(String(100))
    model: Mapped[str | None] = mapped_column(String(100))
    size: Mapped[str | None] = mapped_column(String(50))
    serial_number: Mapped[str | None] = mapped_column(String(100), index=True)
    # Odómetro del vehículo al momento de instalar el neumático
    km_at_install: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Límite de km configurado para este eje/posición
    km_limit: Mapped[int | None] = mapped_column(Integer)
    # Km actuales del neumático (= odómetro_actual - km_at_install)
    current_km: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default=EstadoNeumatico.EN_USO, nullable=False, index=True)
    notes: Mapped[str | None] = mapped_column(Text)

    vehicle: Mapped["Vehicle"] = relationship(back_populates="tires")  # noqa: F821
