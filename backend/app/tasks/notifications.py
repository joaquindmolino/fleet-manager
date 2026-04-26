"""Tareas Celery para generación y envío de notificaciones y alertas de vencimiento."""

from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.notifications.check_expirations")
def check_expirations() -> dict:
    """
    Revisa todos los tenants activos y genera notificaciones para:
    - Services próximos a vencer (por km o fecha)
    - Neumáticos cerca del límite de km
    - Documentos de vehículos por vencer (VTV, seguro, etc.)
    - Licencias de choferes por vencer
    """
    # TODO: implementar con sesión de base de datos síncrona o usar task async con asyncio.run
    return {"status": "ok", "checked": 0}


@celery_app.task(name="app.tasks.notifications.send_push_notification")
def send_push_notification(user_id: str, title: str, body: str) -> dict:
    """Envía una notificación push via Firebase a un usuario específico."""
    # TODO: implementar integración Firebase Admin SDK
    return {"status": "ok", "user_id": user_id}


@celery_app.task(name="app.tasks.notifications.send_email_notification")
def send_email_notification(to_email: str, subject: str, body_html: str) -> dict:
    """Envía un email de notificación via SendGrid."""
    # TODO: implementar integración SendGrid
    return {"status": "ok", "to": to_email}
