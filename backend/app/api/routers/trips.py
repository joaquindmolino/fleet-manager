"""Router de viajes."""

import uuid
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.driver import Driver
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.models.tire import Tire
from app.schemas.common import PaginatedResponse
from app.schemas.trip import TripCreate, TripResponse, TripUpdate, QuickTripCreate
from app.models.trip import EstadoViaje

router = APIRouter(prefix="/trips", tags=["trips"])

_can_ver = Depends(make_permission_checker("viajes", "ver"))
_can_crear = Depends(make_permission_checker("viajes", "crear"))
_can_editar = Depends(make_permission_checker("viajes", "editar"))


@router.post("/quick", response_model=TripResponse, status_code=status.HTTP_201_CREATED)
async def quick_trip(body: QuickTripCreate, current_user: CurrentUser, db: DbSession) -> Trip:
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

    # Verificar documento asociado duplicado
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

    trip = Trip(
        tenant_id=current_user.tenant_id,
        vehicle_id=driver.vehicle_id,
        driver_id=driver.id,
        client_id=body.client_id,
        origin="Depósito",
        destination=f"Reparto {body.associated_document}",
        status=EstadoViaje.EN_CURSO,
        associated_document=body.associated_document,
        stops_count=body.stops_count,
        start_odometer=body.start_odometer,
        notes=body.notes,
    )
    db.add(trip)
    await db.flush()

    if body.start_odometer is not None and vehicle:
        vehicle.odometer = body.start_odometer

    await db.refresh(trip)
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
async def create_trip(body: TripCreate, current_user: CurrentUser, db: DbSession) -> Trip:
    trip = Trip(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(trip)
    await db.flush()
    await db.refresh(trip)
    return trip


@router.get("/{trip_id}", response_model=TripResponse, dependencies=[_can_ver])
async def get_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Trip:
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")
    return trip


@router.patch("/{trip_id}", response_model=TripResponse, dependencies=[_can_editar])
async def update_trip(
    trip_id: uuid.UUID, body: TripUpdate, current_user: CurrentUser, db: DbSession
) -> Trip:
    result = await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )
    trip = result.scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(trip, field, value)

    # Al completar el viaje: actualiza odómetro del vehículo y km de neumáticos
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
    return trip
