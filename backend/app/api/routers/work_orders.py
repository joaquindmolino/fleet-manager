"""Router de órdenes de trabajo."""

import uuid
import math
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.maintenance import MaintenanceRecord
from app.models.vehicle import Vehicle
from app.models.work_order import EstadoAprobacion, EstadoOrden, WorkOrder
from app.schemas.common import PaginatedResponse
from app.schemas.work_order import (
    WorkOrderApprove,
    WorkOrderCancel,
    WorkOrderComplete,
    WorkOrderCreate,
    WorkOrderReject,
    WorkOrderResponse,
    WorkOrderUpdate,
)

router = APIRouter(prefix="/work-orders", tags=["work_orders"])

_can_ver = Depends(make_permission_checker("mantenimiento", "ver"))
_can_crear = Depends(make_permission_checker("mantenimiento", "crear"))
_can_editar = Depends(make_permission_checker("mantenimiento", "editar"))
_can_cerrar = Depends(make_permission_checker("mantenimiento", "cerrar"))
_can_aprobar = Depends(make_permission_checker("mantenimiento", "aprobar"))


def _serialize(order: WorkOrder) -> WorkOrderResponse:
    """Convierte un WorkOrder a su response hidratado con datos de relaciones."""
    return WorkOrderResponse(
        id=order.id,
        tenant_id=order.tenant_id,
        vehicle_id=order.vehicle_id,
        machine_id=order.machine_id,
        assigned_to=order.assigned_to,
        description=order.description,
        priority=order.priority,
        status=order.status,
        approval_status=order.approval_status,
        approved_by=order.approved_by,
        approved_at=order.approved_at,
        rejection_reason=order.rejection_reason,
        scheduled_date=order.scheduled_date,
        due_date=order.due_date,
        completed_date=order.completed_date,
        completed_at=order.completed_at,
        notes=order.notes,
        vehicle_plate=order.vehicle.plate if order.vehicle else None,
        machine_name=order.machine.name if order.machine else None,
        assigned_to_name=order.assigned_to_user.full_name if order.assigned_to_user else None,
        approved_by_name=order.approver.full_name if order.approver else None,
    )


async def _get_order_or_404(order_id: uuid.UUID, tenant_id: uuid.UUID, db) -> WorkOrder:
    result = await db.execute(
        select(WorkOrder)
        .where(WorkOrder.id == order_id, WorkOrder.tenant_id == tenant_id)
        .options(
            selectinload(WorkOrder.vehicle),
            selectinload(WorkOrder.machine),
            selectinload(WorkOrder.assigned_to_user),
            selectinload(WorkOrder.approver),
        )
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return order


@router.get("", response_model=PaginatedResponse[WorkOrderResponse], dependencies=[_can_ver])
async def list_work_orders(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    status_filter: str | None = None,
    approval_status: str | None = None,
    scheduled_from: date | None = None,
    scheduled_to: date | None = None,
    vehicle_id: uuid.UUID | None = None,
    machine_id: uuid.UUID | None = None,
    assigned_to: uuid.UUID | None = None,
) -> PaginatedResponse[WorkOrderResponse]:
    """Lista las órdenes de trabajo del tenant con filtros opcionales."""
    base = select(WorkOrder).where(WorkOrder.tenant_id == current_user.tenant_id)
    count = select(func.count()).select_from(WorkOrder).where(
        WorkOrder.tenant_id == current_user.tenant_id
    )

    if status_filter:
        statuses = [s.strip() for s in status_filter.split(",") if s.strip()]
        if statuses:
            base = base.where(WorkOrder.status.in_(statuses))
            count = count.where(WorkOrder.status.in_(statuses))
    if approval_status:
        base = base.where(WorkOrder.approval_status == approval_status)
        count = count.where(WorkOrder.approval_status == approval_status)
    if scheduled_from is not None:
        base = base.where(WorkOrder.scheduled_date >= scheduled_from)
        count = count.where(WorkOrder.scheduled_date >= scheduled_from)
    if scheduled_to is not None:
        base = base.where(WorkOrder.scheduled_date <= scheduled_to)
        count = count.where(WorkOrder.scheduled_date <= scheduled_to)
    if vehicle_id is not None:
        base = base.where(WorkOrder.vehicle_id == vehicle_id)
        count = count.where(WorkOrder.vehicle_id == vehicle_id)
    if machine_id is not None:
        base = base.where(WorkOrder.machine_id == machine_id)
        count = count.where(WorkOrder.machine_id == machine_id)
    if assigned_to is not None:
        base = base.where(WorkOrder.assigned_to == assigned_to)
        count = count.where(WorkOrder.assigned_to == assigned_to)

    total = (await db.execute(count)).scalar_one()
    orders = (
        await db.execute(
            base.options(
                selectinload(WorkOrder.vehicle),
                selectinload(WorkOrder.machine),
                selectinload(WorkOrder.assigned_to_user),
                selectinload(WorkOrder.approver),
            )
            .order_by(WorkOrder.scheduled_date.asc().nulls_last(), WorkOrder.created_at.desc())
            .offset((page - 1) * size)
            .limit(size)
        )
    ).scalars().all()

    return PaginatedResponse(
        items=[_serialize(o) for o in orders],
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.post("", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_work_order(
    body: WorkOrderCreate,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    """Abre una nueva orden de trabajo en estado pendiente de aprobación."""
    payload = body.model_dump()
    order = WorkOrder(
        tenant_id=current_user.tenant_id,
        approval_status=EstadoAprobacion.PENDIENTE,
        **payload,
    )
    db.add(order)
    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)


@router.get("/{order_id}", response_model=WorkOrderResponse, dependencies=[_can_ver])
async def get_work_order(order_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> WorkOrderResponse:
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    return _serialize(order)


@router.patch("/{order_id}", response_model=WorkOrderResponse, dependencies=[_can_editar])
async def update_work_order(
    order_id: uuid.UUID,
    body: WorkOrderUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(order, field, value)

    # Si se marca como completada vía PATCH, registra el timestamp (compat).
    if body.status == EstadoOrden.COMPLETADA and order.completed_at is None:
        order.completed_at = datetime.now(timezone.utc)

    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)


@router.post("/{order_id}/approve", response_model=WorkOrderResponse, dependencies=[_can_aprobar])
async def approve_work_order(
    order_id: uuid.UUID,
    body: WorkOrderApprove,  # noqa: ARG001
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    if order.approval_status == EstadoAprobacion.APROBADA:
        raise HTTPException(status_code=400, detail="La orden ya está aprobada.")
    if order.status in (EstadoOrden.COMPLETADA, EstadoOrden.CANCELADA):
        raise HTTPException(status_code=400, detail="No se puede aprobar una orden cerrada.")
    order.approval_status = EstadoAprobacion.APROBADA
    order.approved_by = current_user.id
    order.approved_at = datetime.now(timezone.utc)
    order.rejection_reason = None
    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)


@router.post("/{order_id}/reject", response_model=WorkOrderResponse, dependencies=[_can_aprobar])
async def reject_work_order(
    order_id: uuid.UUID,
    body: WorkOrderReject,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    if order.status in (EstadoOrden.COMPLETADA, EstadoOrden.CANCELADA):
        raise HTTPException(status_code=400, detail="No se puede rechazar una orden cerrada.")
    order.approval_status = EstadoAprobacion.RECHAZADA
    order.approved_by = current_user.id
    order.approved_at = datetime.now(timezone.utc)
    order.rejection_reason = (body.reason or "").strip() or None
    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)


@router.post("/{order_id}/cancel", response_model=WorkOrderResponse, dependencies=[_can_editar])
async def cancel_work_order(
    order_id: uuid.UUID,
    body: WorkOrderCancel,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    if order.status == EstadoOrden.CANCELADA:
        raise HTTPException(status_code=400, detail="La orden ya está cancelada.")
    if order.status == EstadoOrden.COMPLETADA:
        raise HTTPException(status_code=400, detail="No se puede cancelar una orden completada.")
    order.status = EstadoOrden.CANCELADA
    reason = (body.reason or "").strip()
    if reason:
        prefix = "Cancelada: "
        order.notes = f"{order.notes}\n{prefix}{reason}" if order.notes else f"{prefix}{reason}"
    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)


@router.post("/{order_id}/complete", response_model=WorkOrderResponse, dependencies=[_can_cerrar])
async def complete_work_order(
    order_id: uuid.UUID,
    body: WorkOrderComplete,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    """Marca la orden como realizada y crea el MaintenanceRecord asociado."""
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    if order.status == EstadoOrden.COMPLETADA:
        raise HTTPException(status_code=400, detail="La orden ya está completada.")
    if order.status == EstadoOrden.CANCELADA:
        raise HTTPException(status_code=400, detail="No se puede completar una orden cancelada.")

    service_date = body.completed_date or date.today()
    order.status = EstadoOrden.COMPLETADA
    order.completed_date = service_date
    order.completed_at = datetime.now(timezone.utc)

    # Asentar también el km en el vehículo si vino en el cuerpo y es mayor al actual.
    if body.odometer_at_service is not None and order.vehicle_id is not None:
        vehicle = (await db.execute(select(Vehicle).where(Vehicle.id == order.vehicle_id))).scalar_one_or_none()
        if vehicle is not None and body.odometer_at_service > (vehicle.odometer or 0):
            vehicle.odometer = body.odometer_at_service

    # Crear MaintenanceRecord vinculado a esta orden.
    record = MaintenanceRecord(
        tenant_id=current_user.tenant_id,
        vehicle_id=order.vehicle_id,
        machine_id=order.machine_id,
        service_id=body.service_id,
        supplier_id=body.supplier_id,
        work_order_id=order.id,
        service_date=service_date,
        odometer_at_service=body.odometer_at_service,
        cost=body.cost,
        notes=body.notes or order.description,
    )
    db.add(record)

    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)


@router.post("/{order_id}/close", response_model=WorkOrderResponse, dependencies=[_can_cerrar])
async def close_work_order(
    order_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrderResponse:
    """Cierra (completa) una orden sin crear historial. Compat con UI vieja."""
    order = await _get_order_or_404(order_id, current_user.tenant_id, db)
    if order.status == EstadoOrden.COMPLETADA:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La orden ya está cerrada")
    order.status = EstadoOrden.COMPLETADA
    order.completed_at = datetime.now(timezone.utc)
    if order.completed_date is None:
        order.completed_date = date.today()
    await db.flush()
    order = await _get_order_or_404(order.id, current_user.tenant_id, db)
    return _serialize(order)
