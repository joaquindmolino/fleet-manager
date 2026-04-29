"""Endpoint de configuración inicial: crea el tenant, superadmin y roles base."""

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentUser, DbSession, require_superadmin
from app.core.config import settings
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User, Role, Permission, role_permissions

router = APIRouter(prefix="/setup", tags=["setup"])

_MODULES = [
    "vehiculos", "conductores", "maquinas",
    "mantenimiento", "viajes", "proveedores", "clientes",
    "gps", "reportes", "usuarios", "configuracion",
]
_ACTIONS = ["ver", "crear", "editar", "aprobar", "cerrar", "eliminar"]

_DEFAULT_ROLES: dict[str, set[tuple[str, str]]] = {
    "Administrador": {(m, a) for m in _MODULES for a in _ACTIONS},
    "Encargado de mantenimiento": {
        ("vehiculos", "ver"), ("vehiculos", "crear"), ("vehiculos", "editar"),
        ("conductores", "ver"), ("conductores", "crear"), ("conductores", "editar"),
        ("maquinas", "ver"), ("maquinas", "crear"), ("maquinas", "editar"),
        ("mantenimiento", "ver"), ("mantenimiento", "crear"), ("mantenimiento", "editar"), ("mantenimiento", "cerrar"),
        ("proveedores", "ver"), ("proveedores", "crear"), ("proveedores", "editar"),
        ("clientes", "ver"),
        ("viajes", "ver"),
        ("reportes", "ver"),
    },
    "Coordinador de viajes": {
        ("vehiculos", "ver"),
        ("conductores", "ver"),
        ("clientes", "ver"), ("clientes", "crear"), ("clientes", "editar"),
        ("viajes", "ver"), ("viajes", "crear"), ("viajes", "editar"), ("viajes", "cerrar"),
        ("reportes", "ver"),
    },
    "Chofer": {
        ("vehiculos", "ver"),
        ("conductores", "ver"),
        ("clientes", "ver"),
        ("viajes", "ver"),
    },
    "Operario de depósito": {
        ("maquinas", "ver"),
        ("maquinas", "editar"),
        ("mantenimiento", "ver"),
    },
}


async def seed_tenant_roles(tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    """Crea o actualiza los roles base del sistema para un tenant. Retorna contadores."""
    # Obtener o crear todos los permisos globales
    existing_perms = (await db.execute(select(Permission))).scalars().all()
    perm_map: dict[tuple[str, str], Permission] = {(p.module, p.action): p for p in existing_perms}

    for module in _MODULES:
        for action in _ACTIONS:
            key = (module, action)
            if key not in perm_map:
                p = Permission(id=uuid.uuid4(), module=module, action=action)
                db.add(p)
                perm_map[key] = p

    await db.flush()

    # Cargar roles existentes del tenant con sus permisos
    existing_roles_result = (await db.execute(
        select(Role)
        .where(Role.tenant_id == tenant_id)
        .options(selectinload(Role.permissions))
    )).scalars().all()
    existing_by_name: dict[str, Role] = {r.name: r for r in existing_roles_result}

    created = updated = 0
    for role_name, target_perms in _DEFAULT_ROLES.items():
        target_perm_objs = [perm_map[key] for key in target_perms if key in perm_map]

        if role_name in existing_by_name:
            # Actualizar permisos del rol existente
            role = existing_by_name[role_name]
            role.permissions = target_perm_objs
            updated += 1
        else:
            role = Role(id=uuid.uuid4(), tenant_id=tenant_id, name=role_name, is_system=True)
            role.permissions = target_perm_objs
            db.add(role)
            created += 1

    await db.flush()
    return {"creados": created, "actualizados": updated}


class SetupRequest(BaseModel):
    setup_key: str
    empresa: str
    admin_nombre: str
    admin_email: EmailStr
    admin_password: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def initial_setup(body: SetupRequest, db: DbSession) -> dict:
    """Crea el tenant, superadmin y roles base iniciales. Solo funciona una vez."""
    if body.setup_key != settings.SECRET_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup key incorrecta.")

    existing = (await db.execute(select(User).where(User.is_superadmin == True))).scalar_one_or_none()  # noqa: E712
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El sistema ya fue inicializado.")

    if len(body.admin_password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La contraseña debe tener al menos 6 caracteres.")

    slug = body.empresa.lower().replace(" ", "-")[:50]
    tenant = Tenant(id=uuid.uuid4(), name=body.empresa, slug=slug, plan="trial", is_active=True)
    db.add(tenant)
    await db.flush()

    admin = User(
        id=uuid.uuid4(), tenant_id=tenant.id,
        email=body.admin_email, full_name=body.admin_nombre,
        hashed_password=hash_password(body.admin_password),
        is_active=True, is_superadmin=True,
    )
    db.add(admin)
    await db.flush()

    result = await seed_tenant_roles(tenant.id, db)
    await db.commit()

    return {"ok": True, "mensaje": f"Sistema inicializado. Podés entrar con {body.admin_email}.", **result}


@router.post("/seed-roles", status_code=status.HTTP_200_OK)
async def seed_roles(
    db: DbSession,
    current_user: CurrentUser,
    _: User = Depends(require_superadmin),
) -> dict:
    """Crea o actualiza los roles base para el tenant autenticado. Seguro de ejecutar varias veces."""
    result = await seed_tenant_roles(current_user.tenant_id, db)
    await db.commit()
    return {"ok": True, **result}
