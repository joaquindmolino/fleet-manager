"""Panel de superadmin: gestión de tenants e impersonación."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import CurrentUser, DbSession, require_superadmin
from app.api.routers.setup import seed_tenant_roles
from app.core.security import create_access_token, hash_password
from app.models.tenant import Tenant
from app.models.user import User, Role
from app.schemas.admin import TenantCreate, TenantResponse
from app.schemas.auth import Token

router = APIRouter(prefix="/admin", tags=["admin"])

SuperAdmin = Depends(require_superadmin)


@router.get("/tenants", response_model=list[TenantResponse])
async def list_tenants(
    db: DbSession,
    current_user: CurrentUser,
    _: User = SuperAdmin,
) -> list[TenantResponse]:
    """Lista todos los tenants con cantidad de usuarios."""
    tenants = (await db.execute(select(Tenant).order_by(Tenant.created_at))).scalars().all()

    counts_result = (await db.execute(
        select(User.tenant_id, func.count(User.id)).group_by(User.tenant_id)
    )).all()
    count_map: dict[uuid.UUID, int] = {row[0]: row[1] for row in counts_result}

    return [
        TenantResponse(
            id=t.id, name=t.name, slug=t.slug, plan=t.plan,
            is_active=t.is_active, created_at=t.created_at,
            user_count=count_map.get(t.id, 0),
        )
        for t in tenants
    ]


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    body: TenantCreate,
    db: DbSession,
    current_user: CurrentUser,
    _: User = SuperAdmin,
) -> TenantResponse:
    """Crea un nuevo tenant con su primer usuario administrador."""
    slug_taken = (await db.execute(select(Tenant.id).where(Tenant.slug == body.slug))).scalar_one_or_none()
    if slug_taken:
        raise HTTPException(status_code=409, detail="El slug ya está en uso.")

    tenant = Tenant(id=uuid.uuid4(), name=body.name, slug=body.slug, plan=body.plan, is_active=True)
    db.add(tenant)
    await db.flush()

    await seed_tenant_roles(tenant.id, db)

    admin_role = (await db.execute(
        select(Role).where(Role.tenant_id == tenant.id, Role.name == "Administrador")
    )).scalar_one_or_none()

    admin = User(
        id=uuid.uuid4(), tenant_id=tenant.id,
        email=body.admin_email, full_name=body.admin_nombre,
        hashed_password=hash_password(body.admin_password),
        is_active=True, is_superadmin=False,
        role_id=admin_role.id if admin_role else None,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(tenant)

    return TenantResponse(
        id=tenant.id, name=tenant.name, slug=tenant.slug, plan=tenant.plan,
        is_active=tenant.is_active, created_at=tenant.created_at,
        user_count=1,
    )


@router.patch("/tenants/{tenant_id}/toggle", response_model=TenantResponse)
async def toggle_tenant(
    tenant_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    _: User = SuperAdmin,
) -> TenantResponse:
    """Activa o desactiva un tenant."""
    tenant = (await db.execute(select(Tenant).where(Tenant.id == tenant_id))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")

    tenant.is_active = not tenant.is_active
    await db.commit()
    await db.refresh(tenant)

    count = (await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant_id)
    )).scalar() or 0

    return TenantResponse(
        id=tenant.id, name=tenant.name, slug=tenant.slug, plan=tenant.plan,
        is_active=tenant.is_active, created_at=tenant.created_at,
        user_count=count,
    )


@router.post("/tenants/{tenant_id}/impersonate", response_model=Token)
async def impersonate_tenant(
    tenant_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
    _: User = SuperAdmin,
) -> Token:
    """Genera un token con override de tenant para que el superadmin opere como esa empresa."""
    tenant = (await db.execute(
        select(Tenant).where(Tenant.id == tenant_id, Tenant.is_active == True)  # noqa: E712
    )).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Empresa no encontrada o inactiva.")

    token = create_access_token(
        subject=str(current_user.id),
        tenant_id_override=str(tenant_id),
    )
    return Token(access_token=token)
