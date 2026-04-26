"""
Script de inicialización: crea el tenant demo, permisos, roles del sistema y superadmin.
Uso: python seed.py
"""

import asyncio
import os
import sys

# Permite ejecutar desde la carpeta backend/
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import select, insert, delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.security import hash_password
from app.models import (  # noqa: F401 — registra todos los modelos
    Tenant, User, Role, Permission, role_permissions,
    Vehicle, Machine, Driver,
)

# ---------------------------------------------------------------------------
# Definición de permisos del sistema
# ---------------------------------------------------------------------------

MODULES = ["flota", "mantenimiento", "viajes", "proveedores", "gps", "reportes", "usuarios", "configuracion"]
ACTIONS = ["ver", "crear", "editar", "aprobar", "cerrar", "eliminar"]

# Permisos por rol de sistema
ROLE_PERMISSIONS: dict[str, list[tuple[str, str]]] = {
    "Administrador": [
        (m, a) for m in MODULES for a in ACTIONS
    ],
    "Encargado de mantenimiento": [
        ("mantenimiento", "ver"), ("mantenimiento", "crear"), ("mantenimiento", "editar"),
        ("mantenimiento", "aprobar"), ("mantenimiento", "cerrar"),
        ("proveedores", "ver"), ("proveedores", "crear"), ("proveedores", "editar"),
        ("flota", "ver"),
        ("reportes", "ver"),
    ],
    "Coordinador de viajes": [
        ("viajes", "ver"), ("viajes", "crear"), ("viajes", "editar"),
        ("flota", "ver"),
        ("reportes", "ver"),
    ],
    "Chofer": [
        ("viajes", "ver"),
        ("flota", "ver"),
    ],
    "Operario de depósito": [
        ("flota", "ver"),
        ("mantenimiento", "ver"),
    ],
}


async def seed(db: AsyncSession) -> None:
    print("→ Verificando tenant demo...")
    result = await db.execute(select(Tenant).where(Tenant.slug == "demo"))
    tenant = result.scalar_one_or_none()

    if tenant is None:
        tenant = Tenant(name="Empresa Demo", slug="demo", plan="pro")
        db.add(tenant)
        await db.flush()
        print(f"  Tenant creado: {tenant.name} (id={tenant.id})")
    else:
        print(f"  Tenant ya existe: {tenant.name}")

    # --- Permisos ---
    print("→ Creando permisos...")
    perm_map: dict[tuple[str, str], Permission] = {}
    for module in MODULES:
        for action in ACTIONS:
            result = await db.execute(
                select(Permission).where(Permission.module == module, Permission.action == action)
            )
            perm = result.scalar_one_or_none()
            if perm is None:
                perm = Permission(module=module, action=action, description=f"{action} en {module}")
                db.add(perm)
                await db.flush()
            perm_map[(module, action)] = perm
    print(f"  {len(perm_map)} permisos listos.")

    # --- Roles del sistema ---
    print("→ Creando roles del sistema...")
    role_map: dict[str, Role] = {}
    for role_name, perms in ROLE_PERMISSIONS.items():
        result = await db.execute(
            select(Role).where(Role.tenant_id == tenant.id, Role.name == role_name)
        )
        role = result.scalar_one_or_none()
        if role is None:
            role = Role(tenant_id=tenant.id, name=role_name, is_system=True)
            db.add(role)
            await db.flush()
            print(f"  Rol creado: {role_name}")

        # Insertar permisos directamente en la tabla de asociación para evitar lazy loading
        await db.execute(delete(role_permissions).where(role_permissions.c.role_id == role.id))
        perm_rows = [
            {"role_id": role.id, "permission_id": perm_map[p].id}
            for p in perms if p in perm_map
        ]
        if perm_rows:
            await db.execute(insert(role_permissions), perm_rows)
        role_map[role_name] = role
    await db.flush()

    # --- Superadmin ---
    print("→ Verificando superadmin...")
    admin_email = os.getenv("SEED_ADMIN_EMAIL", "admin@fleetmanager.app")
    admin_password = os.getenv("SEED_ADMIN_PASSWORD", "Admin1234!")

    result = await db.execute(select(User).where(User.email == admin_email))
    admin = result.scalar_one_or_none()

    if admin is None:
        admin = User(
            tenant_id=tenant.id,
            email=admin_email,
            full_name="Administrador",
            hashed_password=hash_password(admin_password),
            is_superadmin=True,
            role_id=role_map["Administrador"].id,
        )
        db.add(admin)
        await db.flush()
        print(f"  Superadmin creado: {admin_email} / {admin_password}")
    else:
        print(f"  Superadmin ya existe: {admin_email}")

    await db.commit()
    print("✓ Seed completado.")


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_factory() as session:
        await seed(session)
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
