"""Router del pool de ubicaciones pendientes (bandeja del coordinador)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.pool_location import PoolLocation
from app.models.trip import Trip, TripPlannedStop
from app.schemas.pool_location import (
    AssignToTripRequest, PoolLocationCreate, PoolLocationResponse, PoolLocationUpdate,
)
from app.schemas.trip import TripPlannedStopResponse

router = APIRouter(prefix="/pool-locations", tags=["pool-locations"])

_can_ver = Depends(make_permission_checker("viajes", "ver"))
_can_crear = Depends(make_permission_checker("viajes", "crear"))
_can_editar = Depends(make_permission_checker("viajes", "editar"))


@router.get("", response_model=list[PoolLocationResponse], dependencies=[_can_ver])
async def list_pool_locations(current_user: CurrentUser, db: DbSession) -> list[PoolLocation]:
    """Lista todas las ubicaciones pendientes del tenant en orden cronológico."""
    result = await db.execute(
        select(PoolLocation)
        .where(PoolLocation.tenant_id == current_user.tenant_id)
        .order_by(PoolLocation.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=PoolLocationResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_pool_location(
    body: PoolLocationCreate, current_user: CurrentUser, db: DbSession,
) -> PoolLocation:
    """Agrega una ubicación al pool del coordinador."""
    loc = PoolLocation(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(loc)
    await db.flush()
    await db.refresh(loc)
    return loc


@router.patch("/{location_id}", response_model=PoolLocationResponse, dependencies=[_can_editar])
async def update_pool_location(
    location_id: uuid.UUID, body: PoolLocationUpdate, current_user: CurrentUser, db: DbSession,
) -> PoolLocation:
    """Edita alias, notas o color del pin de una ubicación en el pool."""
    loc = (await db.execute(
        select(PoolLocation).where(
            PoolLocation.id == location_id,
            PoolLocation.tenant_id == current_user.tenant_id,
        )
    )).scalar_one_or_none()
    if loc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada.")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(loc, field, value)
    await db.flush()
    await db.refresh(loc)
    return loc


@router.delete("/{location_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[_can_editar])
async def delete_pool_location(
    location_id: uuid.UUID, current_user: CurrentUser, db: DbSession,
) -> None:
    """Elimina una ubicación del pool."""
    result = await db.execute(
        delete(PoolLocation).where(
            PoolLocation.id == location_id,
            PoolLocation.tenant_id == current_user.tenant_id,
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ubicación no encontrada.")


@router.post(
    "/assign-to-trip/{trip_id}",
    response_model=list[TripPlannedStopResponse],
    dependencies=[_can_editar],
)
async def assign_pool_to_trip(
    trip_id: uuid.UUID,
    body: AssignToTripRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> list[TripPlannedStop]:
    """Mueve ubicaciones del pool a un viaje. Crea planned_stops al final de la
    secuencia actual del viaje y elimina las del pool. Idempotente por viaje."""
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")

    locations = (await db.execute(
        select(PoolLocation).where(
            PoolLocation.id.in_(body.location_ids),
            PoolLocation.tenant_id == tid,
        )
    )).scalars().all()
    if not locations:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ubicaciones no encontradas en el pool.")

    # Mapa para preservar el orden recibido (location_ids en body)
    loc_by_id = {loc.id: loc for loc in locations}
    ordered = [loc_by_id[lid] for lid in body.location_ids if lid in loc_by_id]

    # Secuencia siguiente en el viaje
    current_max = (await db.execute(
        select(func.max(TripPlannedStop.sequence)).where(TripPlannedStop.trip_id == trip_id)
    )).scalar_one()
    next_seq = (current_max + 1) if current_max is not None else 0

    for loc in ordered:
        db.add(TripPlannedStop(
            tenant_id=tid,
            trip_id=trip_id,
            sequence=next_seq,
            alias=loc.alias,
            address=loc.address,
            lat=loc.lat,
            lng=loc.lng,
            service_minutes=15,
            notes=loc.notes,
            pin_color=loc.pin_color,
        ))
        next_seq += 1

    # Eliminar del pool
    await db.execute(
        delete(PoolLocation).where(
            PoolLocation.id.in_([loc.id for loc in ordered]),
            PoolLocation.tenant_id == tid,
        )
    )

    await db.flush()
    result = await db.execute(
        select(TripPlannedStop)
        .where(TripPlannedStop.trip_id == trip_id)
        .order_by(TripPlannedStop.sequence)
    )
    return list(result.scalars().all())


@router.post(
    "/return-from-trip/{trip_id}/{stop_id}",
    response_model=PoolLocationResponse,
    dependencies=[_can_editar],
)
async def return_stop_to_pool(
    trip_id: uuid.UUID,
    stop_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> PoolLocation:
    """Devuelve una parada planificada al pool. Borra la planned_stop y recrea
    la ubicación en el pool con el mismo alias/notes/color."""
    tid = current_user.tenant_id
    stop = (await db.execute(
        select(TripPlannedStop).where(
            TripPlannedStop.id == stop_id,
            TripPlannedStop.trip_id == trip_id,
            TripPlannedStop.tenant_id == tid,
        )
    )).scalar_one_or_none()
    if stop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parada no encontrada.")

    loc = PoolLocation(
        tenant_id=tid,
        alias=stop.alias,
        address=stop.address,
        lat=stop.lat,
        lng=stop.lng,
        notes=stop.notes,
        pin_color=stop.pin_color,
    )
    db.add(loc)
    await db.execute(delete(TripPlannedStop).where(TripPlannedStop.id == stop_id))
    await db.flush()
    await db.refresh(loc)
    return loc
