"""Router de viajes."""

import uuid
import math
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.trip import Trip, TripStop
from app.models.vehicle import Vehicle
from app.models.tire import Tire
from app.schemas.common import PaginatedResponse
from app.schemas.trip import TripCreate, TripResponse, TripUpdate, QuickTripCreate, TripStopCreate, TripStopResponse
from app.models.trip import EstadoViaje
from app.tasks.notifications import _async_notify_trip_assigned, _async_notify_trip_started, _async_notify_trip_completed

router = APIRouter(prefix="/trips", tags=["trips"])

_can_ver = Depends(make_permission_checker("viajes", "ver"))
_can_crear = Depends(make_permission_checker("viajes", "crear"))
_can_editar = Depends(make_permission_checker("viajes", "editar"))


async def _get_trip_scope(current_user, db) -> tuple[str, list[uuid.UUID]]:
    """
    Determina el alcance de viajes visible para el usuario:
    - 'driver': solo sus propios viajes (si tiene perfil de conductor)
    - 'coordinator': viajes de su equipo asignado
    - 'all': sin restricción
    Retorna (tipo, lista_de_driver_ids_o_vacia).
    """
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if driver is not None:
        return ("driver", [driver.id])

    assigned = (await db.execute(
        select(CoordinatorAssignment.driver_id).where(
            CoordinatorAssignment.coordinator_user_id == current_user.id,
            CoordinatorAssignment.tenant_id == current_user.tenant_id,
        )
    )).scalars().all()
    if assigned:
        return ("coordinator", list(assigned))

    return ("all", [])


@router.post("/quick", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def quick_trip(body: QuickTripCreate, current_user: CurrentUser, db: DbSession, bg: BackgroundTasks) -> Trip:
    """Carga rápida de reparto: auto-detecta el conductor y vehículo del usuario."""
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No tenés un perfil de conductor asignado. Pedile al administrador que te vincule.",
        )
    if driver.vehicle_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No tenés un vehículo asignado. Pedile al administrador que te asigne uno.",
        )

    # Validar odómetro antes de crear el viaje
    vehicle = None
    if body.start_odometer is not None:
        vehicle = (await db.execute(select(Vehicle).where(Vehicle.id == driver.vehicle_id))).scalar_one_or_none()
        if vehicle and body.start_odometer < (vehicle.odometer or 0):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"El odómetro no puede ser menor al actual ({vehicle.odometer} km)",
            )

    # Verificar documento asociado duplicado (solo si se ingresó uno)
    if body.associated_document:
        existing = (await db.execute(
            select(Trip).where(
                Trip.tenant_id == current_user.tenant_id,
                Trip.associated_document == body.associated_document,
            )
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Ya existe un viaje con el documento '{body.associated_document}'",
            )

    destination = f"Reparto {body.associated_document}" if body.associated_document else "Reparto del día"
    trip = Trip(
        tenant_id=current_user.tenant_id,
        vehicle_id=driver.vehicle_id,
        driver_id=driver.id,
        client_id=body.client_id,
        origin="Depósito",
        destination=destination,
        status=EstadoViaje.PENDIENTE,
        associated_document=body.associated_document,
        stops_count=body.stops_count,
        start_odometer=body.start_odometer,
        scheduled_date=body.scheduled_date,
        notes=body.notes,
    )
    db.add(trip)
    await db.flush()

    if body.start_odometer is not None and vehicle:
        vehicle.odometer = body.start_odometer

    await db.refresh(trip)
    if trip.driver_id:
        bg.add_task(_async_notify_trip_assigned, str(trip.id))
    return trip


@router.get("/pending", response_model=list[TripResponse])
async def get_pending_trips(current_user: CurrentUser, db: DbSession) -> list[Trip]:
    """Lista los viajes pendientes asignados al conductor autenticado."""
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if driver is None:
        return []
    trips = (await db.execute(
        select(Trip).where(
            Trip.driver_id == driver.id,
            Trip.tenant_id == current_user.tenant_id,
            Trip.status == EstadoViaje.PENDIENTE,
        ).order_by(Trip.created_at.desc())
    )).scalars().all()
    return list(trips)


@router.get("/active", response_model=TripResponse)
async def get_active_trip(current_user: CurrentUser, db: DbSession) -> Trip:
    """Obtiene el viaje en curso del conductor autenticado."""
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tenés perfil de conductor.")
    trip = (await db.execute(
        select(Trip).where(
            Trip.driver_id == driver.id,
            Trip.tenant_id == current_user.tenant_id,
            Trip.status == EstadoViaje.EN_CURSO,
        ).order_by(Trip.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tenés un viaje activo.")
    return trip


@router.get("", response_model=PaginatedResponse[TripResponse], dependencies=[_can_ver])
async def list_trips(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    vehicle_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
) -> PaginatedResponse[TripResponse]:
    query = select(Trip).where(Trip.tenant_id == current_user.tenant_id)
    count_q = select(func.count()).select_from(Trip).where(Trip.tenant_id == current_user.tenant_id)

    scope_type, scope_ids = await _get_trip_scope(current_user, db)
    if scope_type in ("driver", "coordinator"):
        query = query.where(Trip.driver_id.in_(scope_ids))
        count_q = count_q.where(Trip.driver_id.in_(scope_ids))

    if vehicle_id:
        query = query.where(Trip.vehicle_id == vehicle_id)
        count_q = count_q.where(Trip.vehicle_id == vehicle_id)
    if driver_id:
        query = query.where(Trip.driver_id == driver_id)
        count_q = count_q.where(Trip.driver_id == driver_id)

    total = (await db.execute(count_q)).scalar_one()
    trips = (
        await db.execute(query.offset((page - 1) * size).limit(size).order_by(Trip.created_at.desc()))
    ).scalars().all()
    return PaginatedResponse(items=trips, total=total, page=page, size=size, pages=math.ceil(total / size) if total else 1)


@router.post("", response_model=TripResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_trip(body: TripCreate, current_user: CurrentUser, db: DbSession, bg: BackgroundTasks) -> Trip:
    trip = Trip(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(trip)
    await db.flush()
    await db.refresh(trip)
    if trip.driver_id:
        bg.add_task(_async_notify_trip_assigned, str(trip.id))
    return trip


@router.get("/{trip_id}", response_model=TripResponse, dependencies=[_can_ver])
async def get_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Trip:
    query = select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    scope_type, scope_ids = await _get_trip_scope(current_user, db)
    if scope_type in ("driver", "coordinator"):
        query = query.where(Trip.driver_id.in_(scope_ids))
    trip = (await db.execute(query)).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")
    return trip


@router.patch("/{trip_id}", response_model=TripResponse, dependencies=[_can_editar])
async def update_trip(
    trip_id: uuid.UUID, body: TripUpdate, current_user: CurrentUser, db: DbSession, bg: BackgroundTasks
) -> Trip:
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(trip, field, value)

    # Al completar el viaje: registra end_time y actualiza odómetro del vehículo y km de neumáticos
    if body.status == EstadoViaje.COMPLETADO and not trip.end_time and "end_time" not in body.model_fields_set:
        trip.end_time = datetime.now(timezone.utc)

    if body.status == "completado" and body.end_odometer and trip.start_odometer:
        km_driven = body.end_odometer - trip.start_odometer
        vehicle_result = await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))
        vehicle = vehicle_result.scalar_one_or_none()
        if vehicle and km_driven > 0:
            vehicle.odometer = body.end_odometer
            tires_result = await db.execute(
                select(Tire).where(Tire.vehicle_id == trip.vehicle_id, Tire.status == "en_uso")
            )
            for tire in tires_result.scalars().all():
                tire.current_km += km_driven

    await db.flush()
    await db.refresh(trip)
    if body.status == EstadoViaje.COMPLETADO:
        bg.add_task(_async_notify_trip_completed, str(trip.id))
    return trip


@router.post("/{trip_id}/start", response_model=TripResponse)
async def start_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession, bg: BackgroundTasks) -> Trip:
    """Inicia un viaje pendiente: lo pasa a en_curso y registra el start_time."""
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No tenés perfil de conductor.")
    trip = (await db.execute(
        select(Trip).where(
            Trip.id == trip_id,
            Trip.tenant_id == current_user.tenant_id,
            Trip.driver_id == driver.id,
        )
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    if trip.status != EstadoViaje.PENDIENTE:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El viaje no está en estado pendiente.")
    trip.status = EstadoViaje.EN_CURSO
    trip.start_time = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(trip)
    bg.add_task(_async_notify_trip_started, str(trip.id))
    return trip


@router.get("/{trip_id}/stops", response_model=list[TripStopResponse], dependencies=[_can_ver])
async def list_trip_stops(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> list[TripStop]:
    """Lista las entregas registradas de un viaje."""
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    stops = (await db.execute(
        select(TripStop).where(TripStop.trip_id == trip_id).order_by(TripStop.timestamp)
    )).scalars().all()
    return list(stops)


@router.post("/{trip_id}/stops", response_model=TripStopResponse, status_code=status.HTTP_201_CREATED)
async def create_trip_stop(trip_id: uuid.UUID, body: TripStopCreate, current_user: CurrentUser, db: DbSession) -> TripStop:
    """Registra una entrega con geolocalización durante un viaje en curso."""
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    if trip.status != EstadoViaje.EN_CURSO:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El viaje no está en curso.")

    stop_count = (await db.execute(
        select(func.count()).select_from(TripStop).where(TripStop.trip_id == trip_id)
    )).scalar_one()

    is_extra = trip.stops_count is not None and stop_count >= trip.stops_count

    stop = TripStop(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        trip_id=trip_id,
        lat=body.lat,
        lng=body.lng,
        accuracy=body.accuracy,
        notes=body.notes,
        timestamp=body.timestamp,
        is_extra=is_extra,
    )
    db.add(stop)
    await db.flush()
    await db.refresh(stop)
    return stop
