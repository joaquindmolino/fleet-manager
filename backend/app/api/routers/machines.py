"""Router CRUD de máquinas de depósito."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.machine import Machine
from app.schemas.common import PaginatedResponse
from app.schemas.machine import MachineCreate, MachineResponse, MachineUpdate

router = APIRouter(prefix="/machines", tags=["machines"])

_can_ver = Depends(make_permission_checker("flota", "ver"))
_can_crear = Depends(make_permission_checker("flota", "crear"))
_can_editar = Depends(make_permission_checker("flota", "editar"))


@router.get("", response_model=PaginatedResponse[MachineResponse], dependencies=[_can_ver])
async def list_machines(
    current_user: CurrentUser, db: DbSession, page: int = 1, size: int = 20
) -> PaginatedResponse[MachineResponse]:
    total = (
        await db.execute(
            select(func.count()).select_from(Machine).where(Machine.tenant_id == current_user.tenant_id)
        )
    ).scalar_one()
    machines = (
        await db.execute(
            select(Machine)
            .where(Machine.tenant_id == current_user.tenant_id)
            .offset((page - 1) * size)
            .limit(size)
            .order_by(Machine.name)
        )
    ).scalars().all()
    return PaginatedResponse(items=machines, total=total, page=page, size=size, pages=math.ceil(total / size) if total else 1)


@router.post("", response_model=MachineResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_machine(body: MachineCreate, current_user: CurrentUser, db: DbSession) -> Machine:
    machine = Machine(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(machine)
    await db.flush()
    await db.refresh(machine)
    return machine


@router.get("/{machine_id}", response_model=MachineResponse, dependencies=[_can_ver])
async def get_machine(machine_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Machine:
    result = await db.execute(
        select(Machine).where(Machine.id == machine_id, Machine.tenant_id == current_user.tenant_id)
    )
    machine = result.scalar_one_or_none()
    if machine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Máquina no encontrada")
    return machine


@router.patch("/{machine_id}", response_model=MachineResponse, dependencies=[_can_editar])
async def update_machine(
    machine_id: uuid.UUID, body: MachineUpdate, current_user: CurrentUser, db: DbSession
) -> Machine:
    result = await db.execute(
        select(Machine).where(Machine.id == machine_id, Machine.tenant_id == current_user.tenant_id)
    )
    machine = result.scalar_one_or_none()
    if machine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Máquina no encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(machine, field, value)
    await db.flush()
    await db.refresh(machine)
    return machine
