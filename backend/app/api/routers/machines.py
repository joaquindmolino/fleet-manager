"""Router CRUD de máquinas de depósito."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.machine import Machine
from app.schemas.common import PaginatedResponse
from app.schemas.machine import MachineCreate, MachineResponse, MachineUpdate, MachineHoursUpdate
from app.models.user import User

router = APIRouter(prefix="/machines", tags=["machines"])

_can_ver = Depends(make_permission_checker("maquinas", "ver"))
_can_crear = Depends(make_permission_checker("maquinas", "crear"))
_can_editar = Depends(make_permission_checker("maquinas", "editar"))

MAX_HOURS_DELTA = 20


def _is_admin_level(user: User) -> bool:
    """Superadmin o usuario con permiso configuracion:editar (rol Administrador del tenant)."""
    if user.is_superadmin:
        return True
    for ov in user.permission_overrides:
        if ov.permission.module == "configuracion" and ov.permission.action == "editar":
            return ov.granted
    return user.role is not None and any(
        p.module == "configuracion" and p.action == "editar" for p in user.role.permissions
    )


def _can_manage_machines(user: User) -> bool:
    """True si puede ver todas las máquinas (admin o con maquinas:editar)."""
    if _is_admin_level(user):
        return True
    for ov in user.permission_overrides:
        if ov.permission.module == "maquinas" and ov.permission.action == "editar":
            return ov.granted
    return user.role is not None and any(
        p.module == "maquinas" and p.action == "editar" for p in user.role.permissions
    )


@router.get("", response_model=PaginatedResponse[MachineResponse], dependencies=[_can_ver])
async def list_machines(
    current_user: CurrentUser, db: DbSession, page: int = 1, size: int = 20
) -> PaginatedResponse[MachineResponse]:
    conditions = [Machine.tenant_id == current_user.tenant_id]
    if not _can_manage_machines(current_user):
        conditions.append(Machine.assigned_user_id == current_user.id)

    total = (
        await db.execute(select(func.count()).select_from(Machine).where(*conditions))
    ).scalar_one()
    machines = (
        await db.execute(
            select(Machine).where(*conditions).offset((page - 1) * size).limit(size).order_by(Machine.name)
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


@router.patch("/{machine_id}/hours", response_model=MachineResponse, dependencies=[_can_editar])
async def update_machine_hours(
    machine_id: uuid.UUID,
    body: MachineHoursUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> Machine:
    """Actualiza las horas del odómetro. Operario: máximo +20 h. Administrador: sin límite superior."""
    result = await db.execute(
        select(Machine).where(Machine.id == machine_id, Machine.tenant_id == current_user.tenant_id)
    )
    machine = result.scalar_one_or_none()
    if machine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Máquina no encontrada")

    if body.hours_used < machine.hours_used:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Las horas no pueden ser menores a las actuales ({machine.hours_used} h)",
        )

    if not _is_admin_level(current_user) and body.hours_used > machine.hours_used + MAX_HOURS_DELTA:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Podés ingresar como máximo {MAX_HOURS_DELTA} horas más que las actuales ({machine.hours_used} h). Máximo permitido: {machine.hours_used + MAX_HOURS_DELTA} h",
        )

    machine.hours_used = body.hours_used
    await db.flush()
    await db.refresh(machine)
    return machine
