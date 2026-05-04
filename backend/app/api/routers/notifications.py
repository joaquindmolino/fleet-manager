"""Router de notificaciones in-app del usuario autenticado."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select, func, update

from app.api.dependencies import CurrentUser, DbSession
from app.models.notification import Notification
from app.schemas.notification import NotificationResponse, UnreadCountResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
async def list_notifications(current_user: CurrentUser, db: DbSession) -> list[Notification]:
    """Lista las últimas 50 notificaciones del usuario autenticado, no leídas primero."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id, Notification.tenant_id == current_user.tenant_id)
        .order_by(Notification.is_read.asc(), Notification.created_at.desc())
        .limit(50)
    )
    return list(result.scalars().all())


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(current_user: CurrentUser, db: DbSession) -> UnreadCountResponse:
    """Retorna la cantidad de notificaciones no leídas del usuario."""
    count = (await db.execute(
        select(func.count()).select_from(Notification).where(
            Notification.user_id == current_user.id,
            Notification.tenant_id == current_user.tenant_id,
            Notification.is_read.is_(False),
        )
    )).scalar_one()
    return UnreadCountResponse(count=count)


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_read(notification_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> Notification:
    """Marca una notificación como leída."""
    notif = (await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id,
        )
    )).scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notificación no encontrada")
    notif.is_read = True
    await db.flush()
    await db.refresh(notif)
    return notif


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(current_user: CurrentUser, db: DbSession) -> None:
    """Marca todas las notificaciones del usuario como leídas."""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.tenant_id == current_user.tenant_id)
        .values(is_read=True)
    )
