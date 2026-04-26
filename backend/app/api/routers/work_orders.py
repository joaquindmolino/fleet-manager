"""Router de órdenes de trabajo."""

import uuid
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.work_order import WorkOrder
from app.schemas.common import PaginatedResponse
from app.schemas.work_order import WorkOrderCreate, WorkOrderResponse, WorkOrderUpdate

router = APIRouter(prefix="/work-orders", tags=["work_orders"])

_can_ver = Depends(make_permission_checker("mantenimiento", "ver"))
_can_crear = Depends(make_permission_checker("mantenimiento", "crear"))
_can_editar = Depends(make_permission_checker("mantenimiento", "editar"))
_can_cerrar = Depends(make_permission_checker("mantenimiento", "cerrar"))


@router.get("", response_model=PaginatedResponse[WorkOrderResponse], dependencies=[_can_ver])
async def list_work_orders(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    status_filter: str | None = None,
) -> PaginatedResponse[WorkOrderResponse]:
    """Lista las órdenes de trabajo del tenant."""
    query = select(WorkOrder).where(WorkOrder.tenant_id == current_user.tenant_id)
    count_query = select(func.count()).select_from(WorkOrder).where(
        WorkOrder.tenant_id == current_user.tenant_id
    )

    if status_filter:
        query = query.where(WorkOrder.status == status_filter)
        count_query = count_query.where(WorkOrder.status == status_filter)

    total = (await db.execute(count_query)).scalar_one()
    orders = (
        await db.execute(
            query.offset((page - 1) * size).limit(size).order_by(WorkOrder.created_at.desc())
        )
    ).scalars().all()

    return PaginatedResponse(
        items=orders,
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
) -> WorkOrder:
    """Abre una nueva orden de trabajo."""
    order = WorkOrder(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(order)
    await db.flush()
    await db.refresh(order)
    return order


@router.get("/{order_id}", response_model=WorkOrderResponse, dependencies=[_can_ver])
async def get_work_order(order_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> WorkOrder:
    result = await db.execute(
        select(WorkOrder).where(WorkOrder.id == order_id, WorkOrder.tenant_id == current_user.tenant_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    return order


@router.patch("/{order_id}", response_model=WorkOrderResponse, dependencies=[_can_editar])
async def update_work_order(
    order_id: uuid.UUID,
    body: WorkOrderUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkOrder:
    result = await db.execute(
        select(WorkOrder).where(WorkOrder.id == order_id, WorkOrder.tenant_id == current_user.tenant_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(order, field, value)

    # Si se marca como completada, registra el timestamp
    if body.status == "completada" and order.completed_at is None:
        order.completed_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(order)
    return order


@router.post("/{order_id}/close", response_model=WorkOrderResponse)
async def close_work_order(
    order_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    _: None = _can_cerrar,
) -> WorkOrder:
    """Cierra (completa) una orden de trabajo."""
    result = await db.execute(
        select(WorkOrder).where(WorkOrder.id == order_id, WorkOrder.tenant_id == current_user.tenant_id)
    )
    order = result.scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Orden no encontrada")
    if order.status == "completada":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La orden ya está cerrada")

    order.status = "completada"
    order.completed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(order)
    return order
