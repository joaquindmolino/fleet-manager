"""Router de asignaciones de flota a cargo (encargados de mantenimiento)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete, update

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.fleet_assignment import FleetAssignment
from app.models.machine import Machine
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.fleet_assignment import FleetAssignmentsResponse, SetFleetAssignments

router = APIRouter(prefix="/fleet-assignments", tags=["fleet-assignments"])

_can_ver = Depends(make_permission_checker("usuarios", "ver"))
_can_editar = Depends(make_permission_checker("usuarios", "editar"))


@router.get("/me", response_model=FleetAssignmentsResponse)
async def get_my_fleet(current_user: CurrentUser, db: DbSession) -> FleetAssignmentsResponse:
    """Retorna la flota asignada al usuario autenticado."""
    tid = current_user.tenant_id
    vehicle_ids = (await db.execute(
        select(FleetAssignment.vehicle_id).where(
            FleetAssignment.user_id == current_user.id,
            FleetAssignment.tenant_id == tid,
            FleetAssignment.vehicle_id.isnot(None),
        )
    )).scalars().all()
    machine_ids = (await db.execute(
        select(FleetAssignment.machine_id).where(
            FleetAssignment.user_id == current_user.id,
            FleetAssignment.tenant_id == tid,
            FleetAssignment.machine_id.isnot(None),
        )
    )).scalars().all()
    return FleetAssignmentsResponse(user_id=current_user.id, vehicle_ids=list(vehicle_ids), machine_ids=list(machine_ids))


@router.get("/{user_id}", response_model=FleetAssignmentsResponse, dependencies=[_can_ver])
async def get_user_fleet(user_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> FleetAssignmentsResponse:
    """Retorna la flota asignada a un usuario específico."""
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    tid = current_user.tenant_id
    vehicle_ids = (await db.execute(
        select(FleetAssignment.vehicle_id).where(
            FleetAssignment.user_id == user_id,
            FleetAssignment.tenant_id == tid,
            FleetAssignment.vehicle_id.isnot(None),
        )
    )).scalars().all()
    machine_ids = (await db.execute(
        select(FleetAssignment.machine_id).where(
            FleetAssignment.user_id == user_id,
            FleetAssignment.tenant_id == tid,
            FleetAssignment.machine_id.isnot(None),
        )
    )).scalars().all()
    return FleetAssignmentsResponse(user_id=user_id, vehicle_ids=list(vehicle_ids), machine_ids=list(machine_ids))


@router.put("/{user_id}", response_model=FleetAssignmentsResponse, dependencies=[_can_editar])
async def set_user_fleet(
    user_id: uuid.UUID, body: SetFleetAssignments, current_user: CurrentUser, db: DbSession
) -> FleetAssignmentsResponse:
    """Reemplaza la flota a cargo de un usuario."""
    tid = current_user.tenant_id
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == tid)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Validar que los vehicle_ids pertenezcan al tenant
    if body.vehicle_ids:
        valid = set((await db.execute(
            select(Vehicle.id).where(Vehicle.id.in_(body.vehicle_ids), Vehicle.tenant_id == tid)
        )).scalars().all())
        invalid = set(body.vehicle_ids) - valid
        if invalid:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Vehículo(s) no encontrados")

    # Validar que los machine_ids pertenezcan al tenant
    if body.machine_ids:
        valid = set((await db.execute(
            select(Machine.id).where(Machine.id.in_(body.machine_ids), Machine.tenant_id == tid)
        )).scalars().all())
        invalid = set(body.machine_ids) - valid
        if invalid:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Máquina(s) no encontrada(s)")

    # Reemplazar asignaciones
    await db.execute(delete(FleetAssignment).where(FleetAssignment.user_id == user_id, FleetAssignment.tenant_id == tid))
    for vid in body.vehicle_ids:
        db.add(FleetAssignment(tenant_id=tid, user_id=user_id, vehicle_id=vid))
    for mid in body.machine_ids:
        db.add(FleetAssignment(tenant_id=tid, user_id=user_id, machine_id=mid))

    # Sincronizar Machine.assigned_user_id: refleja quién opera cada máquina
    await db.execute(
        update(Machine)
        .where(Machine.assigned_user_id == user_id, Machine.tenant_id == tid)
        .values(assigned_user_id=None)
    )
    if body.machine_ids:
        await db.execute(
            update(Machine)
            .where(Machine.id.in_(body.machine_ids), Machine.tenant_id == tid)
            .values(assigned_user_id=user_id)
        )

    await db.flush()
    return FleetAssignmentsResponse(user_id=user_id, vehicle_ids=body.vehicle_ids, machine_ids=body.machine_ids)
