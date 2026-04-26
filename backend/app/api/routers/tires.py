"""Router de neumáticos por vehículo."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.tire import Tire
from app.models.vehicle import Vehicle
from app.schemas.tire import TireCreate, TireResponse, TireUpdate

router = APIRouter(prefix="/tires", tags=["tires"])

_can_ver = Depends(make_permission_checker("mantenimiento", "ver"))
_can_crear = Depends(make_permission_checker("mantenimiento", "crear"))
_can_editar = Depends(make_permission_checker("mantenimiento", "editar"))


async def _get_vehicle_or_404(vehicle_id: uuid.UUID, tenant_id: uuid.UUID, db: DbSession) -> Vehicle:
    result = await db.execute(
        select(Vehicle).where(Vehicle.id == vehicle_id, Vehicle.tenant_id == tenant_id)
    )
    vehicle = result.scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")
    return vehicle


@router.get("/vehicle/{vehicle_id}", response_model=list[TireResponse], dependencies=[_can_ver])
async def list_tires_by_vehicle(
    vehicle_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> list[Tire]:
    """Lista todos los neumáticos de un vehículo, ordenados por eje y posición."""
    await _get_vehicle_or_404(vehicle_id, current_user.tenant_id, db)
    result = await db.execute(
        select(Tire)
        .where(Tire.vehicle_id == vehicle_id, Tire.tenant_id == current_user.tenant_id)
        .order_by(Tire.axle, Tire.position)
    )
    return result.scalars().all()


@router.post("", response_model=TireResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_tire(body: TireCreate, current_user: CurrentUser, db: DbSession) -> Tire:
    """Registra un neumático en una posición de un vehículo."""
    await _get_vehicle_or_404(body.vehicle_id, current_user.tenant_id, db)
    tire = Tire(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(tire)
    await db.flush()
    await db.refresh(tire)
    return tire


@router.patch("/{tire_id}", response_model=TireResponse, dependencies=[_can_editar])
async def update_tire(
    tire_id: uuid.UUID, body: TireUpdate, current_user: CurrentUser, db: DbSession
) -> Tire:
    result = await db.execute(
        select(Tire).where(Tire.id == tire_id, Tire.tenant_id == current_user.tenant_id)
    )
    tire = result.scalar_one_or_none()
    if tire is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Neumático no encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tire, field, value)
    await db.flush()
    await db.refresh(tire)
    return tire
