"""Router CRUD de choferes."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.driver import Driver
from app.schemas.common import PaginatedResponse
from app.schemas.driver import DriverCreate, DriverResponse, DriverUpdate

router = APIRouter(prefix="/drivers", tags=["drivers"])

_can_ver = Depends(make_permission_checker("flota", "ver"))
_can_crear = Depends(make_permission_checker("flota", "crear"))
_can_editar = Depends(make_permission_checker("flota", "editar"))


@router.get("", response_model=PaginatedResponse[DriverResponse], dependencies=[_can_ver])
async def list_drivers(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
) -> PaginatedResponse[DriverResponse]:
    total = (
        await db.execute(
            select(func.count()).select_from(Driver).where(Driver.tenant_id == current_user.tenant_id)
        )
    ).scalar_one()

    drivers = (
        await db.execute(
            select(Driver)
            .where(Driver.tenant_id == current_user.tenant_id)
            .offset((page - 1) * size)
            .limit(size)
            .order_by(Driver.full_name)
        )
    ).scalars().all()

    return PaginatedResponse(
        items=drivers,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.post("", response_model=DriverResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_driver(body: DriverCreate, current_user: CurrentUser, db: DbSession) -> Driver:
    driver = Driver(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(driver)
    await db.flush()
    await db.refresh(driver)
    return driver


@router.get("/{driver_id}", response_model=DriverResponse, dependencies=[_can_ver])
async def get_driver(driver_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Driver:
    result = await db.execute(
        select(Driver).where(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)
    )
    driver = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chofer no encontrado")
    return driver


@router.patch("/{driver_id}", response_model=DriverResponse, dependencies=[_can_editar])
async def update_driver(
    driver_id: uuid.UUID, body: DriverUpdate, current_user: CurrentUser, db: DbSession
) -> Driver:
    result = await db.execute(
        select(Driver).where(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)
    )
    driver = result.scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chofer no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(driver, field, value)
    await db.flush()
    await db.refresh(driver)
    return driver
