"""Router de viajes."""

import uuid
import math
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select, func, or_

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.core.config import settings
from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.trip import Trip, TripStop, TripPlannedStop
from app.models.vehicle import Vehicle
from app.models.tire import Tire
from app.schemas.common import PaginatedResponse
from app.schemas.trip import (
    TripCreate, TripResponse, TripUpdate, QuickTripCreate,
    TripStopCreate, TripStopResponse, TripStopUpdate, TripStartBody, TripCompleteBody,
    TripPlannedStopInput, TripPlannedStopResponse, TripPlannedStopUpdate,
)
from app.models.trip import EstadoViaje
from app.models.client import Client
from app.services.route_sheet_pdf import RouteSheetData, RouteSheetStop, build_route_sheet_pdf
from app.services.trips_excel import build_trips_xlsx
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

    # Bloquear si ya tiene un viaje pendiente o en curso asignado.
    blocking = (await db.execute(
        select(Trip).where(
            Trip.driver_id == driver.id,
            Trip.tenant_id == current_user.tenant_id,
            Trip.status.in_([EstadoViaje.PENDIENTE.value, EstadoViaje.EN_CURSO.value]),
        ).limit(1)
    )).scalar_one_or_none()
    if blocking is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ya tenés un viaje asignado pendiente o en curso. Terminá ese antes de iniciar uno nuevo.",
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


async def _build_trips_query(
    current_user,
    db,
    statuses: list[str] | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    vehicle_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
):
    """Construye las queries (select + count) con filtros aplicados y el scope
    del usuario. Devuelve (query, count_q)."""
    query = select(Trip).where(Trip.tenant_id == current_user.tenant_id)
    count_q = select(func.count()).select_from(Trip).where(Trip.tenant_id == current_user.tenant_id)

    scope_type, scope_ids = await _get_trip_scope(current_user, db)
    if scope_type == "driver":
        # Si el chofer no pidió un filtro explícito, defaulteamos a activos.
        effective_statuses = statuses or [
            EstadoViaje.PENDIENTE.value, EstadoViaje.EN_CURSO.value,
        ]
        query = query.where(Trip.driver_id.in_(scope_ids), Trip.status.in_(effective_statuses))
        count_q = count_q.where(Trip.driver_id.in_(scope_ids), Trip.status.in_(effective_statuses))
    elif scope_type == "coordinator":
        cond = or_(Trip.driver_id.in_(scope_ids), Trip.driver_id.is_(None))
        query = query.where(cond)
        count_q = count_q.where(cond)
        if statuses:
            query = query.where(Trip.status.in_(statuses))
            count_q = count_q.where(Trip.status.in_(statuses))
    else:
        if statuses:
            query = query.where(Trip.status.in_(statuses))
            count_q = count_q.where(Trip.status.in_(statuses))

    if vehicle_id:
        query = query.where(Trip.vehicle_id == vehicle_id)
        count_q = count_q.where(Trip.vehicle_id == vehicle_id)
    if driver_id:
        query = query.where(Trip.driver_id == driver_id)
        count_q = count_q.where(Trip.driver_id == driver_id)
    if date_from:
        query = query.where(Trip.created_at >= date_from)
        count_q = count_q.where(Trip.created_at >= date_from)
    if date_to:
        query = query.where(Trip.created_at <= date_to)
        count_q = count_q.where(Trip.created_at <= date_to)
    return query, count_q


@router.get("", response_model=PaginatedResponse[TripResponse], dependencies=[_can_ver])
async def list_trips(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    vehicle_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
    status: str | None = None,  # comma-separated lista de estados, ej "completado,cancelado"
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> PaginatedResponse[TripResponse]:
    statuses = [s.strip() for s in status.split(",") if s.strip()] if status else None
    query, count_q = await _build_trips_query(
        current_user, db,
        statuses=statuses, date_from=date_from, date_to=date_to,
        vehicle_id=vehicle_id, driver_id=driver_id,
    )

    total = (await db.execute(count_q)).scalar_one()
    rows = (await db.execute(
        query
        .add_columns(
            select(func.count(TripPlannedStop.id))
            .where(TripPlannedStop.trip_id == Trip.id)
            .correlate(Trip)
            .scalar_subquery()
            .label("planned_stops_count")
        )
        .offset((page - 1) * size)
        .limit(size)
        .order_by(Trip.created_at.desc())
    )).all()
    items = []
    for trip, planned_count in rows:
        resp = TripResponse.model_validate(trip)
        resp.planned_stops_count = planned_count or 0
        items.append(resp)
    return PaginatedResponse(items=items, total=total, page=page, size=size, pages=math.ceil(total / size) if total else 1)


@router.post("", response_model=TripResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_trip(body: TripCreate, current_user: CurrentUser, db: DbSession, bg: BackgroundTasks) -> Trip:
    data = body.model_dump(exclude={"planned_stops"}, exclude_unset=True)
    trip = Trip(tenant_id=current_user.tenant_id, **data)
    db.add(trip)
    await db.flush()

    if body.planned_stops:
        for i, ps in enumerate(body.planned_stops):
            db.add(TripPlannedStop(
                tenant_id=current_user.tenant_id,
                trip_id=trip.id,
                sequence=i,
                alias=ps.alias,
                address=ps.address,
                lat=ps.lat,
                lng=ps.lng,
                service_minutes=ps.service_minutes,
            ))
        # Si stops_count no fue seteado explícitamente, lo derivamos de la cantidad planificada
        if trip.stops_count is None:
            trip.stops_count = len(body.planned_stops)
        await db.flush()

    await db.refresh(trip)
    if trip.driver_id:
        bg.add_task(_async_notify_trip_assigned, str(trip.id))
    return trip


@router.get("/{trip_id}", response_model=TripResponse, dependencies=[_can_ver])
async def get_trip(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Trip:
    query = select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    scope_type, scope_ids = await _get_trip_scope(current_user, db)
    if scope_type == "driver":
        query = query.where(Trip.driver_id.in_(scope_ids))
    elif scope_type == "coordinator":
        query = query.where(or_(Trip.driver_id.in_(scope_ids), Trip.driver_id.is_(None)))
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
async def start_trip(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    bg: BackgroundTasks,
    body: TripStartBody | None = None,
) -> Trip:
    """Inicia un viaje pendiente: lo pasa a en_curso, registra start_time y GPS opcional."""
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
    if trip.status not in (EstadoViaje.PENDIENTE, EstadoViaje.PLANIFICADO):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El viaje no se puede iniciar en su estado actual.")
    trip.status = EstadoViaje.EN_CURSO
    trip.start_time = datetime.now(timezone.utc)
    if body and body.start_lat is not None and body.start_lng is not None:
        trip.start_lat = body.start_lat
        trip.start_lng = body.start_lng
    await db.flush()
    await db.refresh(trip)
    bg.add_task(_async_notify_trip_started, str(trip.id))
    return trip


@router.post("/{trip_id}/complete", response_model=TripResponse)
async def complete_trip(
    trip_id: uuid.UUID,
    body: TripCompleteBody,
    current_user: CurrentUser,
    db: DbSession,
    bg: BackgroundTasks,
) -> Trip:
    """El conductor finaliza su propio viaje en curso. Registra odómetro y GPS de fin opcionales."""
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
    if trip.status != EstadoViaje.EN_CURSO:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="El viaje no está en curso.")

    trip.status = EstadoViaje.COMPLETADO
    trip.end_time = datetime.now(timezone.utc)
    if body.end_lat is not None and body.end_lng is not None:
        trip.end_lat = body.end_lat
        trip.end_lng = body.end_lng

    if body.end_odometer and trip.start_odometer and body.end_odometer > trip.start_odometer:
        km_driven = body.end_odometer - trip.start_odometer
        trip.end_odometer = body.end_odometer
        vehicle = (await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))).scalar_one_or_none()
        if vehicle:
            vehicle.odometer = body.end_odometer
            tires_result = await db.execute(
                select(Tire).where(Tire.vehicle_id == trip.vehicle_id, Tire.status == "en_uso")
            )
            for tire in tires_result.scalars().all():
                tire.current_km += km_driven

    await db.flush()
    await db.refresh(trip)
    bg.add_task(_async_notify_trip_completed, str(trip.id))
    return trip


@router.get("/{trip_id}/route", dependencies=[_can_ver])
async def get_trip_route(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> dict:
    """
    Devuelve la ruta vehicular real entre las paradas del viaje (orden cronológico),
    obtenida desde OpenRouteService. Respuesta: { geometry: [[lat, lng], ...] }
    """
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")

    stops = (await db.execute(
        select(TripStop).where(TripStop.trip_id == trip_id).order_by(TripStop.timestamp)
    )).scalars().all()

    # Armar la secuencia inicio → paradas → fin
    points: list[tuple[float, float]] = []
    if trip.start_lat is not None and trip.start_lng is not None:
        points.append((trip.start_lat, trip.start_lng))
    points.extend((s.lat, s.lng) for s in stops)
    if trip.end_lat is not None and trip.end_lng is not None:
        points.append((trip.end_lat, trip.end_lng))

    if len(points) < 2:
        return {"geometry": [[p[0], p[1]] for p in points]}

    if not settings.ORS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de ruteo no configurado.",
        )

    # OpenRouteService: POST con coordenadas como [lng, lat]
    coordinates = [[p[1], p[0]] for p in points]
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
                headers={"Authorization": settings.ORS_API_KEY, "Content-Type": "application/json"},
                json={"coordinates": coordinates},
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"OpenRouteService respondió {response.status_code}",
            )
        data = response.json()
        feature = data["features"][0]
        coords = feature["geometry"]["coordinates"]  # [[lng, lat], ...]
        props = feature.get("properties", {})
        summary = props.get("summary", {}) or {}
        segments = props.get("segments", []) or []
        # Convertimos a [lat, lng] para que el frontend lo pase directo a Leaflet
        return {
            "geometry": [[c[1], c[0]] for c in coords],
            "distance_m": summary.get("distance"),
            "duration_s": summary.get("duration"),
            "segments": [
                {"distance_m": s.get("distance"), "duration_s": s.get("duration")}
                for s in segments
            ],
        }
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo contactar al servicio de ruteo: {exc}",
        )
    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Respuesta inválida del servicio de ruteo: {exc}",
        )


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
    import logging
    logger = logging.getLogger(__name__)

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

    try:
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
    except Exception as e:
        logger.exception("Error al crear stop para trip %s: %s", trip_id, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error al guardar la entrega: {type(e).__name__}: {e}",
        )


@router.patch("/{trip_id}/stops/{stop_id}", response_model=TripStopResponse)
async def update_trip_stop(
    trip_id: uuid.UUID,
    stop_id: uuid.UUID,
    body: TripStopUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> TripStop:
    """Edita la nota de una entrega ya registrada (lat/lng/timestamp no se modifican)."""
    stop = (await db.execute(
        select(TripStop).where(
            TripStop.id == stop_id,
            TripStop.trip_id == trip_id,
            TripStop.tenant_id == current_user.tenant_id,
        )
    )).scalar_one_or_none()
    if stop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Entrega no encontrada.")

    if body.notes is not None:
        stop.notes = body.notes or None
    await db.flush()
    await db.refresh(stop)
    return stop


@router.get("/{trip_id}/planned-stops", response_model=list[TripPlannedStopResponse], dependencies=[_can_ver])
async def list_planned_stops(trip_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> list[TripPlannedStop]:
    """Lista las paradas planificadas de un viaje en orden."""
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    result = await db.execute(
        select(TripPlannedStop)
        .where(TripPlannedStop.trip_id == trip_id)
        .order_by(TripPlannedStop.sequence)
    )
    return list(result.scalars().all())


@router.put("/{trip_id}/planned-stops", response_model=list[TripPlannedStopResponse], dependencies=[_can_editar])
async def replace_planned_stops(
    trip_id: uuid.UUID,
    body: list[TripPlannedStopInput],
    current_user: CurrentUser,
    db: DbSession,
) -> list[TripPlannedStop]:
    """Reemplaza atomicamente todas las paradas planificadas del viaje (ideal para drag-and-drop)."""
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")

    # Borrar las anteriores
    from sqlalchemy import delete
    await db.execute(delete(TripPlannedStop).where(TripPlannedStop.trip_id == trip_id))

    # Insertar las nuevas con sequence según el orden recibido
    for i, ps in enumerate(body):
        db.add(TripPlannedStop(
            tenant_id=current_user.tenant_id,
            trip_id=trip_id,
            sequence=i,
            alias=ps.alias,
            address=ps.address,
            lat=ps.lat,
            lng=ps.lng,
            service_minutes=ps.service_minutes,
        ))

    await db.flush()
    result = await db.execute(
        select(TripPlannedStop)
        .where(TripPlannedStop.trip_id == trip_id)
        .order_by(TripPlannedStop.sequence)
    )
    return list(result.scalars().all())


@router.post(
    "/{trip_id}/planned-stops/reorder",
    response_model=list[TripPlannedStopResponse],
    dependencies=[_can_editar],
)
async def reorder_planned_stops(
    trip_id: uuid.UUID,
    stop_ids: list[uuid.UUID],
    current_user: CurrentUser,
    db: DbSession,
) -> list[TripPlannedStop]:
    """Reordena las paradas planificadas de un viaje según el orden recibido en stop_ids.
    No recrea las paradas: solo actualiza el campo sequence preservando notes/pin_color."""
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")

    existing = (await db.execute(
        select(TripPlannedStop).where(
            TripPlannedStop.trip_id == trip_id,
            TripPlannedStop.tenant_id == tid,
        )
    )).scalars().all()
    by_id = {s.id: s for s in existing}
    if set(by_id.keys()) != set(stop_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="stop_ids debe contener exactamente las paradas actuales del viaje.",
        )

    # Asignamos una secuencia negativa primero para evitar choques con
    # cualquier unique constraint sobre (trip_id, sequence) si existiera.
    for s in existing:
        s.sequence = -(s.sequence + 1)
    await db.flush()
    for i, sid in enumerate(stop_ids):
        by_id[sid].sequence = i
    await db.flush()
    result = await db.execute(
        select(TripPlannedStop)
        .where(TripPlannedStop.trip_id == trip_id)
        .order_by(TripPlannedStop.sequence)
    )
    return list(result.scalars().all())


@router.post(
    "/{trip_id}/planned-stops/{stop_id}/move-to/{target_trip_id}",
    response_model=TripPlannedStopResponse,
    dependencies=[_can_editar],
)
async def move_stop_to_other_trip(
    trip_id: uuid.UUID,
    stop_id: uuid.UUID,
    target_trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> TripPlannedStop:
    """Mueve una parada planificada de un viaje a otro, atomicamente.
    Preserva alias/notes/pin_color y la agrega al final de la secuencia del viaje destino."""
    tid = current_user.tenant_id
    if trip_id == target_trip_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Viaje origen y destino son iguales.")

    target = (await db.execute(
        select(Trip).where(Trip.id == target_trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje destino no encontrado.")

    stop = (await db.execute(
        select(TripPlannedStop).where(
            TripPlannedStop.id == stop_id,
            TripPlannedStop.trip_id == trip_id,
            TripPlannedStop.tenant_id == tid,
        )
    )).scalar_one_or_none()
    if stop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parada no encontrada en el viaje origen.")

    current_max = (await db.execute(
        select(func.max(TripPlannedStop.sequence)).where(TripPlannedStop.trip_id == target_trip_id)
    )).scalar_one()
    next_seq = (current_max + 1) if current_max is not None else 0

    stop.trip_id = target_trip_id
    stop.sequence = next_seq
    await db.flush()
    await db.refresh(stop)
    return stop


@router.patch(
    "/{trip_id}/planned-stops/{stop_id}",
    response_model=TripPlannedStopResponse,
    dependencies=[_can_editar],
)
async def update_planned_stop(
    trip_id: uuid.UUID,
    stop_id: uuid.UUID,
    body: TripPlannedStopUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> TripPlannedStop:
    """Actualiza alias, service_minutes, notes o pin_color de una parada planificada."""
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
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(stop, field, value)
    await db.flush()
    await db.refresh(stop)
    return stop


@router.post(
    "/{trip_id}/planned-stops/{stop_id}/promote-to-origin",
    response_model=TripResponse,
    dependencies=[_can_editar],
)
async def promote_stop_to_origin(
    trip_id: uuid.UUID,
    stop_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Trip:
    """Convierte una parada planificada en el inicio del viaje y la elimina del listado."""
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    stop = (await db.execute(
        select(TripPlannedStop).where(
            TripPlannedStop.id == stop_id,
            TripPlannedStop.trip_id == trip_id,
            TripPlannedStop.tenant_id == tid,
        )
    )).scalar_one_or_none()
    if stop is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parada no encontrada.")

    trip.origin = stop.address
    trip.start_lat = stop.lat
    trip.start_lng = stop.lng

    from sqlalchemy import delete as sa_delete
    await db.execute(sa_delete(TripPlannedStop).where(TripPlannedStop.id == stop_id))
    await db.flush()
    await db.refresh(trip)
    return trip


@router.post("/{trip_id}/back-to-draft", response_model=TripResponse, dependencies=[_can_editar])
async def send_trip_back_to_draft(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Trip:
    """Devuelve un viaje al estado borrador para que el coordinador lo siga editando.

    Solo permitido para viajes en pendiente o planificado. No se puede revertir
    un viaje que ya arrancó (en_curso), está completado o cancelado.
    """
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    if trip.status not in (EstadoViaje.PENDIENTE.value, EstadoViaje.PLANIFICADO.value):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Solo se pueden devolver a borrador viajes pendientes o planificados.",
        )
    trip.status = EstadoViaje.BORRADOR.value
    # Limpio start_time por si quedó seteado al confirmarse (no debería, pero defensivo).
    trip.start_time = None
    await db.flush()
    await db.refresh(trip)
    return trip


@router.get("/export.xlsx", dependencies=[_can_ver])
async def export_trips_xlsx(
    current_user: CurrentUser,
    db: DbSession,
    vehicle_id: uuid.UUID | None = None,
    driver_id: uuid.UUID | None = None,
    status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> Response:
    """Exporta a Excel los viajes que matchean los filtros (mismos que /trips)."""
    statuses = [s.strip() for s in status.split(",") if s.strip()] if status else None
    query, _ = await _build_trips_query(
        current_user, db,
        statuses=statuses, date_from=date_from, date_to=date_to,
        vehicle_id=vehicle_id, driver_id=driver_id,
    )
    trips = (await db.execute(
        query.order_by(Trip.created_at.desc()).limit(5000)
    )).scalars().all()

    # Pre-cargar maps de driver / vehicle / client / planned_stops_count
    tenant_id = current_user.tenant_id
    drivers = {
        d.id: d for d in (await db.execute(
            select(Driver).where(Driver.tenant_id == tenant_id)
        )).scalars().all()
    }
    vehicles = {
        v.id: v for v in (await db.execute(
            select(Vehicle).where(Vehicle.tenant_id == tenant_id)
        )).scalars().all()
    }
    clients = {
        c.id: c for c in (await db.execute(
            select(Client).where(Client.tenant_id == tenant_id)
        )).scalars().all()
    }
    trip_ids = [t.id for t in trips]
    stops_counts: dict[uuid.UUID, int] = {}
    if trip_ids:
        rows = (await db.execute(
            select(TripPlannedStop.trip_id, func.count(TripPlannedStop.id))
            .where(TripPlannedStop.trip_id.in_(trip_ids))
            .group_by(TripPlannedStop.trip_id)
        )).all()
        stops_counts = {row[0]: row[1] for row in rows}

    status_label = {
        "borrador": "Borrador", "pendiente": "Pendiente", "planificado": "Planificado",
        "en_curso": "En curso", "completado": "Completado", "cancelado": "Cancelado",
    }

    rows_data = []
    for t in trips:
        d = drivers.get(t.driver_id) if t.driver_id else None
        v = vehicles.get(t.vehicle_id)
        c = clients.get(t.client_id) if t.client_id else None
        planned_count = stops_counts.get(t.id, 0)
        km_recorridos = None
        if t.start_odometer is not None and t.end_odometer is not None:
            km_recorridos = t.end_odometer - t.start_odometer
        rows_data.append({
            "Nombre del viaje": t.name or "",
            "Documento asociado": t.associated_document or "",
            "Cliente": c.name if c else "",
            "Conductor": d.full_name if d else "",
            "Vehículo": v.plate if v else "",
            "Estado": status_label.get(t.status, t.status),
            "Fecha de creación": t.created_at,
            "Fecha programada": t.scheduled_date,
            "Inicio real": t.start_time,
            "Fin real": t.end_time,
            "Origen": t.origin or "",
            "Destino": t.destination or "",
            "Paradas": planned_count if planned_count > 0 else (t.stops_count or ""),
            "Km inicial": t.start_odometer,
            "Km final": t.end_odometer,
            "Km recorridos": km_recorridos,
            "Observaciones": t.notes or "",
        })

    xlsx_bytes = build_trips_xlsx(rows_data)
    today = datetime.now().strftime("%Y%m%d")
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="viajes-{today}.xlsx"'},
    )


@router.get(
    "/{trip_id}/route-sheet.pdf",
    dependencies=[_can_ver],
)
async def download_route_sheet_pdf(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    """Genera el PDF de hoja de ruta del viaje (paradas + observaciones + QR)."""
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")

    stops_result = (await db.execute(
        select(TripPlannedStop)
        .where(TripPlannedStop.trip_id == trip_id)
        .order_by(TripPlannedStop.sequence)
    )).scalars().all()

    driver_name: str | None = None
    if trip.driver_id:
        d = (await db.execute(select(Driver).where(Driver.id == trip.driver_id))).scalar_one_or_none()
        driver_name = d.full_name if d else None

    veh = (await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))).scalar_one_or_none()
    plate = veh.plate if veh else None

    when = trip.scheduled_date or trip.created_at
    date_label = when.strftime("%d/%m/%Y") if when else ""

    total_service_min = sum((s.service_minutes or 0) for s in stops_result)
    if trip.name:
        display_name = trip.name
    elif date_label:
        display_name = f"Viaje del {date_label}"
    else:
        display_name = "Hoja de ruta"

    data = RouteSheetData(
        trip_name=display_name,
        associated_document=trip.associated_document,
        driver_name=driver_name,
        vehicle_plate=plate,
        date_label=date_label or "—",
        origin_address=trip.origin if (trip.origin and trip.origin != "Por definir") else None,
        origin_lat=trip.start_lat,
        origin_lng=trip.start_lng,
        stops=[
            RouteSheetStop(
                sequence=s.sequence,
                alias=s.alias,
                address=s.address,
                lat=s.lat,
                lng=s.lng,
                service_minutes=s.service_minutes,
                notes=s.notes,
                pin_color=s.pin_color,
                eta_minutes=None,
            )
            for s in stops_result
        ],
        total_km=None,
        total_drive_min=None,
        total_service_min=total_service_min,
    )

    pdf_bytes = build_route_sheet_pdf(data)
    safe_name = (trip.name or "hoja-de-ruta").replace(" ", "_").replace("/", "-")
    filename = f"{safe_name}-{trip_id.hex[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post(
    "/{trip_id}/origin-to-stop",
    response_model=TripPlannedStopResponse,
    dependencies=[_can_editar],
)
async def demote_origin_to_stop(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> TripPlannedStop:
    """Convierte el inicio del viaje en una parada planificada al final de la lista
    y limpia el origen. Inverso de promote-to-origin."""
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    if trip.start_lat is None or trip.start_lng is None or not trip.origin or trip.origin == "Por definir":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="El viaje no tiene origen definido.")

    current_max = (await db.execute(
        select(func.max(TripPlannedStop.sequence)).where(TripPlannedStop.trip_id == trip_id)
    )).scalar_one()
    next_seq = (current_max + 1) if current_max is not None else 0

    new_stop = TripPlannedStop(
        tenant_id=tid,
        trip_id=trip_id,
        sequence=next_seq,
        alias=None,
        address=trip.origin,
        lat=trip.start_lat,
        lng=trip.start_lng,
        service_minutes=15,
        notes=None,
        pin_color="gray",
    )
    db.add(new_stop)

    trip.origin = "Por definir"
    trip.start_lat = None
    trip.start_lng = None
    await db.flush()
    await db.refresh(new_stop)
    return new_stop


@router.post(
    "/{trip_id}/share-token",
    dependencies=[_can_ver],
)
async def get_or_create_share_token(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> dict:
    """Devuelve el token público del viaje, generándolo la primera vez.

    El token es un UUID4 difícil de adivinar. Cualquiera con el link puede
    descargar la hoja de ruta sin autenticación.
    """
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    if trip.share_token is None:
        trip.share_token = uuid.uuid4()
        await db.flush()
        await db.refresh(trip)
    return {"token": str(trip.share_token)}


@router.delete(
    "/{trip_id}/share-token",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[_can_editar],
)
async def revoke_share_token(
    trip_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Revoca el link público actual. Si se vuelve a pedir, se genera uno nuevo."""
    tid = current_user.tenant_id
    trip = (await db.execute(
        select(Trip).where(Trip.id == trip_id, Trip.tenant_id == tid)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado.")
    trip.share_token = None
    await db.flush()
