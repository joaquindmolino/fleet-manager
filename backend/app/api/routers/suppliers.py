"""Router CRUD de proveedores."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker
from app.models.supplier import Supplier
from app.schemas.common import PaginatedResponse
from app.schemas.supplier import SupplierCreate, SupplierResponse, SupplierUpdate

router = APIRouter(prefix="/suppliers", tags=["suppliers"])

_can_ver = Depends(make_permission_checker("proveedores", "ver"))
_can_crear = Depends(make_permission_checker("proveedores", "crear"))
_can_editar = Depends(make_permission_checker("proveedores", "editar"))


@router.get("", response_model=PaginatedResponse[SupplierResponse], dependencies=[_can_ver])
async def list_suppliers(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
    category: str | None = None,
) -> PaginatedResponse[SupplierResponse]:
    query = select(Supplier).where(Supplier.tenant_id == current_user.tenant_id)
    count_query = select(func.count()).select_from(Supplier).where(
        Supplier.tenant_id == current_user.tenant_id
    )
    if category:
        query = query.where(Supplier.category == category)
        count_query = count_query.where(Supplier.category == category)

    total = (await db.execute(count_query)).scalar_one()
    suppliers = (
        await db.execute(query.offset((page - 1) * size).limit(size).order_by(Supplier.name))
    ).scalars().all()

    return PaginatedResponse(
        items=suppliers,
        total=total,
        page=page,
        size=size,
        pages=math.ceil(total / size) if total else 1,
    )


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_supplier(body: SupplierCreate, current_user: CurrentUser, db: DbSession) -> Supplier:
    supplier = Supplier(tenant_id=current_user.tenant_id, **body.model_dump())
    db.add(supplier)
    await db.flush()
    await db.refresh(supplier)
    return supplier


@router.get("/{supplier_id}", response_model=SupplierResponse, dependencies=[_can_ver])
async def get_supplier(supplier_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Supplier:
    result = await db.execute(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.tenant_id == current_user.tenant_id)
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")
    return supplier


@router.patch("/{supplier_id}", response_model=SupplierResponse, dependencies=[_can_editar])
async def update_supplier(
    supplier_id: uuid.UUID, body: SupplierUpdate, current_user: CurrentUser, db: DbSession
) -> Supplier:
    result = await db.execute(
        select(Supplier).where(Supplier.id == supplier_id, Supplier.tenant_id == current_user.tenant_id)
    )
    supplier = result.scalar_one_or_none()
    if supplier is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proveedor no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(supplier, field, value)
    await db.flush()
    await db.refresh(supplier)
    return supplier
