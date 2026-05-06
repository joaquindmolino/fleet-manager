"""CRUD de emails adicionales para notificaciones del sistema."""

import uuid

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.api.dependencies import CurrentUser, DbSession
from app.models.alert_email import AlertEmail

router = APIRouter(prefix="/alert-emails", tags=["alert-emails"])


class AlertEmailCreate(BaseModel):
    email: EmailStr
    label: str | None = None
    tipo_mantenimiento:    bool = True
    tipo_resumen_viajes:   bool = False
    tipo_viaje_asignado:   bool = False
    tipo_viaje_iniciado:   bool = False
    tipo_viaje_completado: bool = False


class AlertEmailUpdate(BaseModel):
    label: str | None = None
    tipo_mantenimiento:    bool | None = None
    tipo_resumen_viajes:   bool | None = None
    tipo_viaje_asignado:   bool | None = None
    tipo_viaje_iniciado:   bool | None = None
    tipo_viaje_completado: bool | None = None


class AlertEmailResponse(BaseModel):
    id: uuid.UUID
    email: str
    label: str | None
    tipo_mantenimiento:    bool
    tipo_resumen_viajes:   bool
    tipo_viaje_asignado:   bool
    tipo_viaje_iniciado:   bool
    tipo_viaje_completado: bool

    model_config = {"from_attributes": True}


@router.get("", response_model=list[AlertEmailResponse])
async def list_alert_emails(current_user: CurrentUser, db: DbSession) -> list[AlertEmail]:
    """Lista los emails configurados para el tenant."""
    result = await db.execute(
        select(AlertEmail)
        .where(AlertEmail.tenant_id == current_user.tenant_id)
        .order_by(AlertEmail.created_at)
    )
    return list(result.scalars().all())


@router.post("", response_model=AlertEmailResponse, status_code=status.HTTP_201_CREATED)
async def create_alert_email(body: AlertEmailCreate, current_user: CurrentUser, db: DbSession) -> AlertEmail:
    """Agrega un email de notificaciones."""
    existing = (await db.execute(
        select(AlertEmail).where(
            AlertEmail.tenant_id == current_user.tenant_id,
            AlertEmail.email == body.email,
        )
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ese email ya está registrado.")

    ae = AlertEmail(
        id=uuid.uuid4(),
        tenant_id=current_user.tenant_id,
        email=body.email,
        label=body.label or None,
        tipo_mantenimiento=body.tipo_mantenimiento,
        tipo_resumen_viajes=body.tipo_resumen_viajes,
        tipo_viaje_asignado=body.tipo_viaje_asignado,
        tipo_viaje_iniciado=body.tipo_viaje_iniciado,
        tipo_viaje_completado=body.tipo_viaje_completado,
    )
    db.add(ae)
    await db.flush()
    await db.refresh(ae)
    return ae


@router.patch("/{alert_email_id}", response_model=AlertEmailResponse)
async def update_alert_email(
    alert_email_id: uuid.UUID, body: AlertEmailUpdate, current_user: CurrentUser, db: DbSession
) -> AlertEmail:
    """Actualiza label y/o tipos de notificación de un email."""
    ae = (await db.execute(
        select(AlertEmail).where(
            AlertEmail.id == alert_email_id,
            AlertEmail.tenant_id == current_user.tenant_id,
        )
    )).scalar_one_or_none()
    if not ae:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email no encontrado.")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(ae, field, value)

    await db.flush()
    await db.refresh(ae)
    return ae


@router.delete("/{alert_email_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_email(alert_email_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> None:
    """Elimina un email de notificaciones."""
    ae = (await db.execute(
        select(AlertEmail).where(
            AlertEmail.id == alert_email_id,
            AlertEmail.tenant_id == current_user.tenant_id,
        )
    )).scalar_one_or_none()
    if not ae:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Email no encontrado.")
    await db.delete(ae)
