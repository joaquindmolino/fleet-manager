"""Router de asignaciones coordinador-conductor."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, delete

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.machine import Machine
from app.models.user import User
from app.schemas.coordinator import CoordinatorAssignmentsResponse, SetCoordinatorAssignments

router = APIRouter(prefix="/coordinator-assignments", tags=["coordinators"])

_can_ver = Depends(make_permission_checker("usuarios", "ver"))
_can_editar = Depends(make_permission_checker("usuarios", "editar"))


@router.get("/me", response_model=CoordinatorAssignmentsResponse)
async def get_my_assignments(current_user: CurrentUser, db: DbSession) -> CoordinatorAssignmentsResponse:
    """Retorna los conductores asignados al coordinador autenticado."""
    rows = (await db.execute(
        select(CoordinatorAssignment.driver_id).where(
            CoordinatorAssignment.coordinator_user_id == current_user.id,
            CoordinatorAssignment.tenant_id == current_user.tenant_id,
        )
    )).scalars().all()
    return CoordinatorAssignmentsResponse(coordinator_user_id=current_user.id, driver_ids=list(rows))


@router.get("/{user_id}", response_model=CoordinatorAssignmentsResponse, dependencies=[_can_ver])
async def get_user_assignments(
    user_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> CoordinatorAssignmentsResponse:
    """Retorna los conductores asignados a un usuario coordinador específico."""
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    rows = (await db.execute(
        select(CoordinatorAssignment.driver_id).where(
            CoordinatorAssignment.coordinator_user_id == user_id,
            CoordinatorAssignment.tenant_id == current_user.tenant_id,
        )
    )).scalars().all()
    return CoordinatorAssignmentsResponse(coordinator_user_id=user_id, driver_ids=list(rows))


@router.put("/{user_id}", response_model=CoordinatorAssignmentsResponse, dependencies=[_can_editar])
async def set_user_assignments(
    user_id: uuid.UUID, body: SetCoordinatorAssignments, current_user: CurrentUser, db: DbSession
) -> CoordinatorAssignmentsResponse:
    """Reemplaza todas las asignaciones de conductores para un coordinador."""
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Choferes y operarios no pueden ser coordinadores de equipo
    is_driver = (await db.execute(
        select(Driver.id).where(Driver.user_id == user_id, Driver.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none() is not None
    is_operario = (await db.execute(
        select(Machine.id).where(Machine.assigned_user_id == user_id, Machine.tenant_id == current_user.tenant_id).limit(1)
    )).scalar_one_or_none() is not None
    if is_driver or is_operario:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Los choferes y operarios no pueden liderar un equipo.",
        )

    # Validar que todos los driver_ids pertenezcan al tenant
    if body.driver_ids:
        valid_drivers = (await db.execute(
            select(Driver.id).where(
                Driver.id.in_(body.driver_ids),
                Driver.tenant_id == current_user.tenant_id,
            )
        )).scalars().all()
        invalid = set(body.driver_ids) - set(valid_drivers)
        if invalid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Uno o más conductores no pertenecen al tenant",
            )

    # Reemplazar: borrar existentes e insertar nuevos
    await db.execute(
        delete(CoordinatorAssignment).where(
            CoordinatorAssignment.coordinator_user_id == user_id,
            CoordinatorAssignment.tenant_id == current_user.tenant_id,
        )
    )
    for driver_id in body.driver_ids:
        db.add(CoordinatorAssignment(
            tenant_id=current_user.tenant_id,
            coordinator_user_id=user_id,
            driver_id=driver_id,
        ))

    await db.flush()
    return CoordinatorAssignmentsResponse(coordinator_user_id=user_id, driver_ids=body.driver_ids)
