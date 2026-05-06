"""Router de autenticación: login y perfil propio."""

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DbSession
from app.core.security import create_access_token, verify_password
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.auth import LoginRequest, TenantCheckResponse, Token
from app.schemas.user import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/tenant/{slug}", response_model=TenantCheckResponse)
async def check_tenant(slug: str, db: DbSession) -> TenantCheckResponse:
    """Verifica que una empresa exista y esté activa por su slug."""
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    tenant = result.scalar_one_or_none()
    if tenant is None or not tenant.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")
    return TenantCheckResponse(name=tenant.name, slug=tenant.slug)


@router.post("/login", response_model=Token)
async def login(body: LoginRequest, db: DbSession) -> Token:
    """Autentica con empresa, usuario y password; retorna JWT de acceso."""
    tenant_result = await db.execute(select(Tenant).where(Tenant.slug == body.tenant_slug))
    tenant = tenant_result.scalar_one_or_none()

    if tenant is None or not tenant.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )

    result = await db.execute(
        select(User).where(User.username == body.username, User.tenant_id == tenant.id)
    )
    user = result.scalar_one_or_none()

    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo",
        )

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser) -> User:
    """Retorna el perfil del usuario autenticado."""
    return current_user
