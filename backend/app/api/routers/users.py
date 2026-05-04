"""Router de gestión de usuarios (solo admin del tenant)."""

import uuid
import math

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.api.dependencies import CurrentUser, DbSession, make_permission_checker, require_superadmin
from app.core.security import hash_password
from app.models.driver import Driver
from app.models.machine import Machine
from app.models.user import User, Role, UserPermission, Permission
from app.schemas.common import PaginatedResponse
from app.schemas.user import (
    UserCreate, UserResponse, UserUpdate, UserPasswordChange,
    RoleResponse, UserPickerResponse,
    UserPermissionOverrideResponse, UserPermissionsUpdate,
    RolePermissionsUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])

_can_ver = Depends(make_permission_checker("usuarios", "ver"))
_can_crear = Depends(make_permission_checker("usuarios", "crear"))
_can_editar = Depends(make_permission_checker("usuarios", "editar"))

_LOAD_ROLE = selectinload(User.role).selectinload(Role.permissions)
_LOAD_OVERRIDES = selectinload(User.permission_overrides).selectinload(UserPermission.permission)


def _user_query(tenant_id: uuid.UUID):
    return select(User).where(User.tenant_id == tenant_id).options(_LOAD_ROLE, _LOAD_OVERRIDES)


@router.get("/for-assignment", response_model=list[UserPickerResponse])
async def list_users_for_assignment(current_user: CurrentUser, db: DbSession) -> list[User]:
    """Lista usuarios del tenant para asignar a conductores u otras entidades. Accesible a cualquier usuario autenticado."""
    result = await db.execute(
        select(User)
        .where(User.tenant_id == current_user.tenant_id, User.is_active.is_(True))
        .order_by(User.full_name)
    )
    return list(result.scalars().all())


@router.get("/roles", response_model=list[RoleResponse])
async def list_roles(current_user: CurrentUser, db: DbSession) -> list[Role]:
    """Lista los roles disponibles del tenant."""
    result = await db.execute(
        select(Role)
        .where(Role.tenant_id == current_user.tenant_id)
        .options(selectinload(Role.permissions))
        .order_by(Role.name)
    )
    return list(result.scalars().all())


@router.patch(
    "/roles/{role_id}/permissions",
    response_model=RoleResponse,
    dependencies=[Depends(make_permission_checker("configuracion", "editar"))],
)
async def update_role_permissions(
    role_id: uuid.UUID,
    body: RolePermissionsUpdate,
    current_user: CurrentUser,
    db: DbSession,
) -> Role:
    """Reemplaza los permisos base de un rol. No afecta overrides individuales de usuarios."""
    result = await db.execute(
        select(Role)
        .where(Role.id == role_id, Role.tenant_id == current_user.tenant_id)
        .options(selectinload(Role.permissions))
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rol no encontrado")

    new_perms: list[Permission] = []
    for item in body.permissions:
        perm_result = await db.execute(
            select(Permission).where(Permission.module == item.module, Permission.action == item.action)
        )
        perm = perm_result.scalar_one_or_none()
        if perm is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Permiso no encontrado: {item.module}:{item.action}",
            )
        new_perms.append(perm)

    role.permissions = new_perms
    await db.flush()

    result2 = await db.execute(
        select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
    )
    return result2.scalar_one()


@router.get("", response_model=PaginatedResponse[UserResponse], dependencies=[_can_ver])
async def list_users(
    current_user: CurrentUser,
    db: DbSession,
    page: int = 1,
    size: int = 20,
) -> PaginatedResponse[UserResponse]:
    """Lista los usuarios del tenant actual con paginación."""
    tid = current_user.tenant_id
    offset = (page - 1) * size
    total = (await db.execute(
        select(func.count()).select_from(User).where(User.tenant_id == tid)
    )).scalar_one()

    users = (await db.execute(
        _user_query(tid).offset(offset).limit(size).order_by(User.full_name)
    )).scalars().all()

    # Computar flags de perfil de campo para filtrar el botón de equipo en el frontend
    driver_user_ids: set[uuid.UUID] = set((await db.execute(
        select(Driver.user_id).where(Driver.tenant_id == tid, Driver.user_id.isnot(None))
    )).scalars().all())
    machine_user_ids: set[uuid.UUID] = set((await db.execute(
        select(Machine.assigned_user_id).where(Machine.tenant_id == tid, Machine.assigned_user_id.isnot(None))
    )).scalars().all())

    items = [
        UserResponse.model_validate(u).model_copy(update={
            "has_driver_profile": u.id in driver_user_ids,
            "has_machine_assigned": u.id in machine_user_ids,
        })
        for u in users
    ]

    return PaginatedResponse(items=items, total=total, page=page, size=size,
                             pages=math.ceil(total / size) if total else 1)


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED, dependencies=[_can_crear])
async def create_user(body: UserCreate, current_user: CurrentUser, db: DbSession) -> User:
    """Crea un nuevo usuario en el tenant del usuario autenticado."""
    existing = await db.execute(
        select(User).where(User.email == body.email, User.tenant_id == current_user.tenant_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El email ya está registrado")

    user = User(
        tenant_id=current_user.tenant_id,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hash_password(body.password),
        role_id=body.role_id,
    )
    db.add(user)
    await db.flush()

    # Re-consultar con relaciones cargadas
    result = await db.execute(_user_query(current_user.tenant_id).where(User.id == user.id))
    return result.scalar_one()


@router.get("/{user_id}", response_model=UserResponse, dependencies=[_can_ver])
async def get_user(user_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> User:
    result = await db.execute(
        _user_query(current_user.tenant_id).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return user


@router.patch("/{user_id}", response_model=UserResponse, dependencies=[_can_editar])
async def update_user(
    user_id: uuid.UUID, body: UserUpdate, current_user: CurrentUser, db: DbSession
) -> User:
    result = await db.execute(
        _user_query(current_user.tenant_id).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(user, field, value)

    await db.flush()
    result2 = await db.execute(_user_query(current_user.tenant_id).where(User.id == user_id))
    return result2.scalar_one()


@router.patch("/{user_id}/password", response_model=UserResponse, dependencies=[_can_editar])
async def change_password(
    user_id: uuid.UUID,
    body: UserPasswordChange,
    current_user: CurrentUser,
    db: DbSession,
) -> User:
    """Cambia la contraseña de un usuario del tenant. Requiere permiso usuarios:editar."""
    if len(body.password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="La contraseña debe tener al menos 6 caracteres")

    result = await db.execute(
        _user_query(current_user.tenant_id).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    user.hashed_password = hash_password(body.password)
    await db.flush()
    result2 = await db.execute(_user_query(current_user.tenant_id).where(User.id == user_id))
    return result2.scalar_one()


@router.get("/{user_id}/permissions", response_model=list[UserPermissionOverrideResponse], dependencies=[_can_editar])
async def get_user_permissions(user_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> list[UserPermission]:
    """Retorna los overrides de permiso individuales del usuario."""
    owner = (await db.execute(
        select(User.id).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )).scalar_one_or_none()
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    result = await db.execute(
        select(UserPermission)
        .where(UserPermission.user_id == user_id)
        .options(selectinload(UserPermission.permission))
    )
    return list(result.scalars().all())


@router.put("/{user_id}/permissions", response_model=list[UserPermissionOverrideResponse], dependencies=[_can_editar])
async def set_user_permissions(
    user_id: uuid.UUID, body: UserPermissionsUpdate, current_user: CurrentUser, db: DbSession
) -> list[UserPermission]:
    """Reemplaza todos los overrides de permiso del usuario. Enviar lista vacía para limpiar todos."""
    # Verificar que el usuario pertenece al tenant
    user_result = await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user.tenant_id)
    )
    if user_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

    # Eliminar todos los overrides actuales
    existing = (await db.execute(
        select(UserPermission).where(UserPermission.user_id == user_id)
    )).scalars().all()
    for ov in existing:
        await db.delete(ov)
    await db.flush()

    # Crear los nuevos overrides
    new_overrides: list[UserPermission] = []
    for item in body.overrides:
        ov = UserPermission(user_id=user_id, permission_id=item.permission_id, granted=item.granted)
        db.add(ov)
        new_overrides.append(ov)
    await db.flush()

    # Recargar con la relación permission
    result = await db.execute(
        select(UserPermission)
        .where(UserPermission.user_id == user_id)
        .options(selectinload(UserPermission.permission))
    )
    return list(result.scalars().all())
