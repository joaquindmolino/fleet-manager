"""Router CRUD de vehículos."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.vehicle import Vehicle
from app.schemas.common import PaginatedResponse
from app.schemas.vehicle import VehicleCreate, VehicleResponse, VehicleUpdate

router = APIRouter(prefix="/vehicles", tags=["vehicles"])

_can_ver = Depends(make_permission_checker("flota", "ver"))
_can_crear = Depends(make_permission_checker("flota", "crear"))
_can_editar = Depends(make_permission_checker("flota", "editar"))


@router.get("", response_model=PaginatedResponse[VehicleResponse], dependencies=[_can_ver])
async def list_vehicles(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    status: str | None = None,
) -> PaginatedResponse[VehicleResponse]:
    """Lista los vehículos del tenant con paginación opcional y filtro por estado."""
    query = select(Vehicle).where(Vehicle.tenant_id == current_user.tenant_id)
    count_query = select(func.count()).select_from(Vehicle).where(Vehicle.tenant_id == current_user.tenant_id)

    if status:
        query = query.where(Vehicle.status == status)
        count_query = count_query.where(Vehicle.status == status)

    total = (await db.execute(count_query)).scalar_one()
    vehicles = (
        await db.execute(query.offset((page - 1) * size).limit(size).order_by(Vehicle.plate))
    ).scalars().all()

    return PaginatedResponse(
        items=vehicles,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.post("", response_model=VehicleResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_vehicle(
    body: VehicleCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> Vehicle:
    """Registra un nuevo vehículo en el tenant."""
    vehicle = Vehicle(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(vehicle)
    await db.flush()
    await db.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleResponse, dependencies=[_can_ver])
async def get_vehicle(vehicle_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Vehicle:
    """Obtiene un vehículo por ID."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == current_user.tenant_id)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")
    return vehicle


@router.patch("/{vehicle_id}", response_model=VehicleResponse, dependencies=[_can_editar])
async def update_vehicle(
    vehicle_id: uuid.UUID,
    body: VehicleUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> Vehicle:
    """Actualiza campos de un vehículo. Usado también para actualizar odómetro."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == current_user.tenant_id)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(vehicle, field, value)

    await db.flush()
    await db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(
    vehicle_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    _: None = Depends(make_permission_checker("flota", "eliminar")),
) -> None:
    """Da de baja lógica a un vehículo (cambia estado a 'baja')."""
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == current_user.tenant_id)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")
    vehicle.status = "baja"
    await db.flush()
