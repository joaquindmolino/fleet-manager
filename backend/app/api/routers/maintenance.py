"""Router de mantenimiento: services programados e historial."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.maintenance import MaintenanceRecord, MaintenanceService
from app.schemas.common import PaginatedResponse
from app.schemas.maintenance import (
    MaintenanceRecordCreate,
    MaintenanceRecordResponse,
    MaintenanceRecordUpdate,
    MaintenanceServiceCreate,
    MaintenanceServiceResponse,
    MaintenanceServiceUpdate,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

_can_ver = Depends(make_permission_checker("mantenimiento", "ver"))
_can_crear = Depends(make_permission_checker("mantenimiento", "crear"))
_can_editar = Depends(make_permission_checker("mantenimiento", "editar"))


# --- Services (definiciones) ---

@router.get("/services", response_model=list[MaintenanceServiceResponse], dependencies=[_can_ver])
async def list_services(current_user: CurrentUser, db: DbSession) -> list[MaintenanceService]:
    """Lista los tipos de service configurados para el tenant."""
    result = await db.execute(
        select(MaintenanceService)
        .where(MaintenanceService.tenant_id == current_user.tenant_id)
        .order_by(MaintenanceService.name)
    )
    return result.scalars().all()


@router.post("/services", response_model=MaintenanceServiceResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_service(
    body: MaintenanceServiceCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> MaintenanceService:
    """Crea un nuevo tipo de service periódico."""
    service = MaintenanceService(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(service)
    await db.flush()
    await db.refresh(service)
    return service


@router.patch("/services/{service_id}", response_model=MaintenanceServiceResponse, dependencies=[_can_editar])
async def update_service(
    service_id: uuid.UUID,
    body: MaintenanceServiceUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> MaintenanceService:
    result = await db.execute(
        select(MaintenanceService).where(
            MaintenanceService.id == service_id,
            MaintenanceService.tenant_id == current_user.tenant_id,
        )
    )
    service = result.scalar_one_or_none()
    if service is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Service no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(service, field, value)
    await db.flush()
    await db.refresh(service)
    return service


# --- Records (historial) ---

@router.get("/records", response_model=PaginatedResponse[MaintenanceRecordResponse], dependencies=[_can_ver])
async def list_records(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    vehicle_id: uuid.UUID | None = None,
    machine_id: uuid.UUID | None = None,
) -> PaginatedResponse[MaintenanceRecordResponse]:
    """Lista el historial de mantenimiento con filtros opcionales por vehículo o máquina."""
    query = select(MaintenanceRecord).where(MaintenanceRecord.tenant_id == current_user.tenant_id)
    count_query = select(func.count()).select_from(MaintenanceRecord).where(
        MaintenanceRecord.tenant_id == current_user.tenant_id
    )

    if vehicle_id:
        query = query.where(MaintenanceRecord.vehicle_id == vehicle_id)
        count_query = count_query.where(MaintenanceRecord.vehicle_id == vehicle_id)
    if machine_id:
        query = query.where(MaintenanceRecord.machine_id == machine_id)
        count_query = count_query.where(MaintenanceRecord.machine_id == machine_id)

    total = (await db.execute(count_query)).scalar_one()
    records = (
        await db.execute(
            query.offset((page - 1) * size).limit(size).order_by(MaintenanceRecord.service_date.desc())
        )
    ).scalars().all()

    return PaginatedResponse(
        items=records,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.post("/records", response_model=MaintenanceRecordResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_record(
    body: MaintenanceRecordCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> MaintenanceRecord:
    """Registra una intervención de mantenimiento realizada."""
    record = MaintenanceRecord(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(record)
    await db.flush()
    await db.refresh(record)
    return record


@router.patch("/records/{record_id}", response_model=MaintenanceRecordResponse, dependencies=[_can_editar])
async def update_record(
    record_id: uuid.UUID,
    body: MaintenanceRecordUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> MaintenanceRecord:
    """Actualiza un registro de mantenimiento existente."""
    result = await db.execute(
        select(MaintenanceRecord).where(
            MaintenanceRecord.id == record_id,
            MaintenanceRecord.tenant_id == current_user.tenant_id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    await db.flush()
    await db.refresh(record)
    return record


@router.get("/records/{record_id}", response_model=MaintenanceRecordResponse, dependencies=[_can_ver])
async def get_record(record_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> MaintenanceRecord:
    result = await db.execute(
        select(MaintenanceRecord).where(
            MaintenanceRecord.id == record_id,
            MaintenanceRecord.tenant_id == current_user.tenant_id,
        )
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro no encontrado")
    return record
