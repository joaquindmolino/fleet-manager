"""Endpoint de configuración inicial: crea el tenant y superadmin la primera vez."""

import uuid
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.dependencies import DbSession
from app.core.config import settings
from app.core.security import hash_password
from app.models.tenant import Tenant
from app.models.user import User

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupRequest(BaseModel):
    setup_key: str
    empresa: str
    admin_nombre: str
    admin_email: EmailStr
    admin_password: str


@router.post("", status_code=status.HTTP_201_CREATED)
async def initial_setup(body: SetupRequest, db: DbSession) -> dict:
    """Crea el tenant y superadmin iniciales. Solo funciona una vez."""

    if body.setup_key != settings.SECRET_KEY:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Setup key incorrecta.")

    # Verificar que no exista ya un superadmin
    existing = (await db.execute(select(User).where(User.is_superadmin == True))).scalar_one_or_none()  # noqa: E712
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="El sistema ya fue inicializado.")

    if len(body.admin_password) < 6:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La contraseña debe tener al menos 6 caracteres.")

    # Crear tenant
    slug = body.empresa.lower().replace(" ", "-")[:50]
    tenant = Tenant(id=uuid.uuid4(), name=body.empresa, slug=slug, plan="trial", is_active=True)
    db.add(tenant)
    await db.flush()

    # Crear superadmin
    admin = User(
        id=uuid.uuid4(),
        tenant_id=tenant.id,
        email=body.admin_email,
        full_name=body.admin_nombre,
        hashed_password=hash_password(body.admin_password),
        is_active=True,
        is_superadmin=True,
    )
    db.add(admin)
    await db.commit()

    return {"ok": True, "mensaje": f"Sistema inicializado. Podés entrar con {body.admin_email}."}
