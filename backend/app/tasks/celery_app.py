"""Configuración de Celery para tareas asíncronas (alertas, sincronización GPS, etc.)."""

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "fleet_manager",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.notifications", "app.tasks.gps_sync"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="America/Argentina/Buenos_Aires",
    enable_utc=True,
    beat_schedule={
        # Resumen diario de viajes — 20:00 ART
        "daily-trips-summary": {
            "task": "app.tasks.notifications.daily_trips_summary",
            "schedule": crontab(hour=20, minute=0),
        },
        # Alertas de mantenimiento — 07:00 ART
        "daily-maintenance-alerts": {
            "task": "app.tasks.notifications.daily_maintenance_alerts",
            "schedule": crontab(hour=7, minute=0),
        },
        # Sincronizar lecturas GPS cada 5 minutos
        "sync-gps-every-5min": {
            "task": "app.tasks.gps_sync.sync_all_tenants",
            "schedule": 300.0,
        },
    },
)
