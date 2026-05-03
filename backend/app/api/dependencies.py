"""Dependencias compartidas de FastAPI: sesión DB, usuario autenticado, permisos."""

import uuid
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import User, Role, UserPermission

bearer_scheme = HTTPBearer()

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> User:
    """Verifica el JWT y retorna el usuario autenticado con su rol y permisos cargados."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Credenciales inválidas",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user_id, tenant_id_override = decode_access_token(credentials.credentials)
    if user_id is None:
        raise credentials_exception

    result = await db.execute(
        select(User)
        .where(User.id == uuid.UUID(user_id))
        .options(
            selectinload(User.role).selectinload(Role.permissions),
            selectinload(User.permission_overrides).selectinload(UserPermission.permission),
        )
    )
    user = result.scalar_one_or_none()

    if user is None or not user.is_active:
        raise credentials_exception

    if tenant_id_override and user.is_superadmin:
        # Desacoplar del session para que la mutación no persista
        db.expunge(user)
        user.tenant_id = uuid.UUID(tenant_id_override)

    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_superadmin(current_user: CurrentUser) -> User:
    """Exige que el usuario sea superadmin global."""
    if not current_user.is_superadmin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acceso restringido")
    return current_user


def make_permission_checker(module: str, action: str):
    """
    Factory que retorna una dependencia FastAPI que verifica si el usuario
    tiene el permiso module+action en su rol.
    Los superadmins siempre tienen acceso.
    """
    async def check(current_user: CurrentUser) -> User:
        if current_user.is_superadmin:
            return current_user

        # Overrides de usuario tienen precedencia sobre el rol
        for ov in current_user.permission_overrides:
            if ov.permission.module == module and ov.permission.action == action:
                if not ov.granted:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permiso requerido: {module}:{action}",
                    )
                return current_user  # override explícito de grant

        # Sin override: chequear rol
        if current_user.role is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin rol asignado")
        has_permission = any(
            p.module == module and p.action == action
            for p in current_user.role.permissions
        )
        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permiso requerido: {module}:{action}",
            )
        return current_user

    return check
