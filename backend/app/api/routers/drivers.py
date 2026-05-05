"""Router CRUD de choferes."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.user import User
from app.schemas.common import PaginatedResponse
from app.schemas.driver import DriverCreate, DriverResponse, DriverUpdate, MyDriverResponse

router = APIRouter(prefix="/drivers", tags=["drivers"])

_can_ver = Depends(make_permission_checker("conductores", "ver"))
_can_crear = Depends(make_permission_checker("conductores", "crear"))
_can_editar = Depends(make_permission_checker("conductores", "editar"))


async def _validate_user_id(
    user_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    db: AsyncSession,
    exclude_driver_id: uuid.UUID | None = None,
) -> None:
    """Valida que el user_id pertenezca al tenant y no esté asignado a otro conductor."""
    if user_id is None:
        return
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tenant_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    existing = select(Driver).where(Driver.user_id == user_id, Driver.tenant_id == tenant_id)
    if exclude_driver_id:
        existing = existing.where(Driver.id != exclude_driver_id)
    if (await db.execute(existing)).scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El usuario ya está asignado a otro conductor")


@router.get("/me", response_model=MyDriverResponse)
async def get_my_driver(current_user: CurrentUser, db: DbSession) -> MyDriverResponse:
    """Retorna el perfil de conductor vinculado al usuario autenticado, incluyendo datos del vehículo."""
    from sqlalchemy.orm import selectinload
    driver = (await db.execute(
        select(Driver)
        .where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
        .options(selectinload(Driver.vehicle))
    )).scalar_one_or_none()
    if driver is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No tenés un perfil de conductor asignado")
    return MyDriverResponse.model_validate(driver)


@router.get("", response_model=PaginatedResponse[DriverResponse], dependencies=[_can_ver])
async def list_drivers(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
) -> PaginatedResponse[DriverResponse]:
    base_filter = Driver.tenant_id == current_user.tenant_id

    self_driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()

    if self_driver is not None:
        # Chofer: solo puede ver su propio perfil
        base_filter = base_filter & (Driver.id == self_driver.id)
    else:
        # Si el usuario tiene asignaciones de coordinador, restringir a su equipo
        assigned = (await db.execute(
            select(CoordinatorAssignment.driver_id).where(
                CoordinatorAssignment.coordinator_user_id == current_user.id,
                CoordinatorAssignment.tenant_id == current_user.tenant_id,
            )
        )).scalars().all()
        if assigned:
            base_filter = base_filter & Driver.id.in_(assigned)

    total = (
        await db.execute(select(func.count()).select_from(Driver).where(base_filter))
    ).scalar_one()

    drivers = (
        await db.execute(
            select(Driver)
            .where(base_filter)
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
    await _validate_user_id(body.user_id, current_user.tenant_id, db)
    driver = Driver(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(driver)
    await db.flush()
    await db.refresh(driver)
    return driver


@router.get("/{driver_id}", response_model=DriverResponse, dependencies=[_can_ver])
async def get_driver(driver_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Driver:
    query = select(Driver).where(Driver.id == driver_id, Driver.tenant_id == current_user.tenant_id)

    self_driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if self_driver is not None:
        query = query.where(Driver.id == self_driver.id)

    driver = (await db.execute(query)).scalar_one_or_none()
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

    data = body.model_dump(exclude_unset=True)
    if "user_id" in data:
        await _validate_user_id(data["user_id"], current_user.tenant_id, db, exclude_driver_id=driver_id)
    for field, value in data.items():
        setattr(driver, field, value)
    await db.flush()
    await db.refresh(driver)
    return driver
