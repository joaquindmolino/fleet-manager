"""Sincronización de flotas: vincula automáticamente vehículos a la flota
de un coordinador cuando se le asigna un chofer que tiene vehículo, y
viceversa. Nunca elimina asignaciones existentes — solo agrega las que
faltan, para evitar borrar configuración hecha a mano por un admin.
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.fleet_assignment import FleetAssignment


async def _ensure_fleet_assignment(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    vehicle_id: uuid.UUID,
) -> None:
    """Crea un FleetAssignment user/vehicle si no existe."""
    existing = (await db.execute(
        select(FleetAssignment.id).where(
            FleetAssignment.user_id == user_id,
            FleetAssignment.vehicle_id == vehicle_id,
            FleetAssignment.tenant_id == tenant_id,
        )
    )).scalar_one_or_none()
    if existing is not None:
        return
    db.add(FleetAssignment(
        tenant_id=tenant_id,
        user_id=user_id,
        vehicle_id=vehicle_id,
    ))


async def sync_fleet_for_coordinator(
    db: AsyncSession,
    coordinator_user_id: uuid.UUID,
    driver_ids: Iterable[uuid.UUID],
    tenant_id: uuid.UUID,
) -> None:
    """Tras asignar drivers a un coordinador, agrega a la flota del coordinador
    los vehículos que esos drivers tengan asignados."""
    ids = list(driver_ids)
    if not ids:
        return
    vehicle_ids = (await db.execute(
        select(Driver.vehicle_id).where(
            Driver.id.in_(ids),
            Driver.tenant_id == tenant_id,
            Driver.vehicle_id.isnot(None),
        )
    )).scalars().all()
    for vid in set(vehicle_ids):
        await _ensure_fleet_assignment(db, tenant_id, coordinator_user_id, vid)


async def sync_fleet_for_driver(
    db: AsyncSession,
    driver_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> None:
    """Tras cambiar el vehicle_id de un driver, agrega ese vehículo a la
    flota de todos los coordinadores que tengan este driver asignado."""
    driver = (await db.execute(
        select(Driver).where(Driver.id == driver_id, Driver.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if driver is None or driver.vehicle_id is None:
        return
    coordinator_ids = (await db.execute(
        select(CoordinatorAssignment.coordinator_user_id).where(
            CoordinatorAssignment.driver_id == driver_id,
            CoordinatorAssignment.tenant_id == tenant_id,
        )
    )).scalars().all()
    for cid in set(coordinator_ids):
        await _ensure_fleet_assignment(db, tenant_id, cid, driver.vehicle_id)
