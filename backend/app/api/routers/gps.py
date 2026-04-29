"""Router de integración GPS (PowerFleet)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.gps import GpsConfig
from app.models.vehicle import Vehicle
from app.schemas.gps import GpsConfigCreate, GpsConfigResponse, VehiclePositionResponse
from app.gps.powerfleet import fetch_user_id, get_vehicle_positions, invalidate_token_cache

router = APIRouter(prefix="/gps", tags=["gps"])

_can_ver = Depends(make_permission_checker("gps", "ver"))
_can_editar = Depends(make_permission_checker("configuracion", "editar"))


@router.get("/config", response_model=GpsConfigResponse | None, dependencies=[_can_ver])
async def get_gps_config(current_user: CurrentUser, db: DbSession) -> GpsConfigResponse | None:
    """Retorna la configuración GPS activa del tenant, sin exponer la contraseña."""
    config = (await db.execute(
        select(GpsConfig).where(
            GpsConfig.tenant_id == current_user.tenant_id,
            GpsConfig.provider == "powerfleet",
        )
    )).scalar_one_or_none()

    if config is None:
        return None

    extra = config.extra_config or {}
    return GpsConfigResponse(
        id=config.id,
        provider=config.provider,
        is_active=config.is_active,
        username=extra.get("username"),
        user_id=extra.get("user_id"),
    )


@router.post("/config", response_model=GpsConfigResponse, dependencies=[_can_editar])
async def save_gps_config(body: GpsConfigCreate, current_user: CurrentUser, db: DbSession) -> GpsConfigResponse:
    """
    Guarda o actualiza las credenciales de PowerFleet.
    Valida las credenciales contra la API y obtiene el userId automáticamente.
    """
    try:
        user_id = await fetch_user_id(body.username, body.password)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"No se pudo conectar con PowerFleet: {e}",
        )

    config = (await db.execute(
        select(GpsConfig).where(
            GpsConfig.tenant_id == current_user.tenant_id,
            GpsConfig.provider == "powerfleet",
        )
    )).scalar_one_or_none()

    extra = {
        "username": body.username,
        "password": body.password,
        "user_id": user_id,
    }

    if config is None:
        config = GpsConfig(
            id=uuid.uuid4(),
            tenant_id=current_user.tenant_id,
            provider="powerfleet",
            api_url="https://api.fleetcomplete.com",
            extra_config=extra,
            is_active=True,
        )
        db.add(config)
    else:
        invalidate_token_cache(str(config.id))
        config.extra_config = extra
        config.is_active = True

    await db.flush()
    await db.refresh(config)

    return GpsConfigResponse(
        id=config.id,
        provider=config.provider,
        is_active=config.is_active,
        username=extra["username"],
        user_id=user_id,
    )


@router.get("/positions", response_model=list[VehiclePositionResponse], dependencies=[_can_ver])
async def get_positions(current_user: CurrentUser, db: DbSession) -> list[VehiclePositionResponse]:
    """Retorna la posición en tiempo real de todos los vehículos activos desde PowerFleet."""
    config = (await db.execute(
        select(GpsConfig).where(
            GpsConfig.tenant_id == current_user.tenant_id,
            GpsConfig.provider == "powerfleet",
            GpsConfig.is_active == True,  # noqa: E712
        )
    )).scalar_one_or_none()

    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="GPS no configurado. Un administrador debe cargar las credenciales de PowerFleet.",
        )

    extra = config.extra_config or {}
    username = extra.get("username")
    password = extra.get("password")
    user_id = extra.get("user_id")

    if not username or not password or not user_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Configuración GPS incompleta. Reconfigurá las credenciales.",
        )

    # Cargar nuestros vehículos para hacer el match por patente
    vehicles = (await db.execute(
        select(Vehicle).where(Vehicle.tenant_id == current_user.tenant_id)
    )).scalars().all()

    plate_to_id = {
        v.plate.upper().replace(" ", "").replace("-", ""): str(v.id)
        for v in vehicles
        if v.plate
    }

    try:
        positions = await get_vehicle_positions(
            config_id=str(config.id),
            username=username,
            password=password,
            user_id=user_id,
            plate_to_vehicle_id=plate_to_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Error al consultar PowerFleet: {e}",
        )

    return [
        VehiclePositionResponse(
            powerfleet_id=p.powerfleet_id,
            name=p.name,
            license_plate=p.license_plate,
            make=p.make,
            model=p.model,
            latitude=p.latitude,
            longitude=p.longitude,
            speed=p.speed,
            direction=p.direction,
            ignition_on=p.ignition_on,
            odometer=p.odometer,
            address=p.address,
            last_update=p.last_update,
            vehicle_id=p.vehicle_id,
        )
        for p in positions
    ]
