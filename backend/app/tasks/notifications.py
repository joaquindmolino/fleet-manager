"""Tareas Celery: notificaciones in-app y emails via Resend."""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.notification import Notification
from app.models.tenant import Tenant
from app.models.tire import Tire
from app.models.trip import Trip, EstadoViaje
from app.models.user import User, Role
from app.models.vehicle import Vehicle
from app.services.email import (
    build_daily_summary_email,
    build_maintenance_alerts_email,
    build_trip_assigned_coordinator_email,
    build_trip_assigned_driver_email,
    build_trip_completed_email,
    build_trip_started_email,
    send_email,
)
from app.tasks.celery_app import celery_app

# ─── DB helper (lazy engine por worker) ───────────────────────────────────────

_engine = None


def _get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
    return _engine


@asynccontextmanager
async def _task_db():
    factory = async_sessionmaker(_get_engine(), expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ─── Helpers de consulta ───────────────────────────────────────────────────────

async def _users_by_roles(db: AsyncSession, tenant_id: uuid.UUID, role_names: list[str]) -> list[User]:
    """Usuarios activos del tenant con alguno de los roles indicados."""
    result = await db.execute(
        select(User)
        .join(Role, User.role_id == Role.id)
        .where(User.tenant_id == tenant_id, User.is_active.is_(True), Role.name.in_(role_names))
    )
    return list(result.scalars().all())


async def _driver_coordinators(db: AsyncSession, driver_id: uuid.UUID, tenant_id: uuid.UUID) -> list[User]:
    """Coordinadores asignados a un chofer específico."""
    coord_ids = (await db.execute(
        select(CoordinatorAssignment.coordinator_user_id).where(
            CoordinatorAssignment.driver_id == driver_id,
            CoordinatorAssignment.tenant_id == tenant_id,
        )
    )).scalars().all()
    if not coord_ids:
        return []
    result = await db.execute(
        select(User).where(User.id.in_(coord_ids), User.is_active.is_(True))
    )
    return list(result.scalars().all())


async def _add_notification(
    db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID,
    title: str, body: str, link: str | None = None,
    notification_type: str = "sistema",
) -> None:
    notif = Notification(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        body=body,
        link=link,
        is_read=False,
    )
    db.add(notif)


# ─── Tareas de eventos de viaje ────────────────────────────────────────────────

@celery_app.task(name="app.tasks.notifications.notify_trip_assigned")
def notify_trip_assigned(trip_id: str) -> dict:
    """Notifica al chofer y sus coordinadores cuando se asigna un viaje."""
    return asyncio.run(_async_notify_trip_assigned(trip_id))


async def _async_notify_trip_assigned(trip_id: str) -> dict:
    async with _task_db() as db:
        trip = (await db.execute(select(Trip).where(Trip.id == uuid.UUID(trip_id)))).scalar_one_or_none()
        if not trip:
            return {"error": "trip not found"}

        driver = None
        driver_user = None
        if trip.driver_id:
            driver = (await db.execute(select(Driver).where(Driver.id == trip.driver_id))).scalar_one_or_none()
            if driver and driver.user_id:
                driver_user = (await db.execute(select(User).where(User.id == driver.user_id))).scalar_one_or_none()

        vehicle = (await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))).scalar_one_or_none()
        vehicle_plate = vehicle.plate if vehicle else "—"
        doc = trip.associated_document or "Reparto del día"
        date_str = trip.scheduled_date.strftime("%d/%m/%Y") if trip.scheduled_date else "Sin fecha programada"
        sent = 0

        if driver_user:
            subject, html = build_trip_assigned_driver_email(
                driver_name=driver_user.full_name, document=doc,
                stops_count=trip.stops_count, vehicle_plate=vehicle_plate,
                date_str=date_str, frontend_url=settings.FRONTEND_URL,
            )
            if driver_user.email:
                send_email(driver_user.email, subject, html)
            await _add_notification(db, trip.tenant_id, driver_user.id,
                title=f"Reparto asignado: {doc}",
                body=f"Tenés un nuevo reparto para el {date_str}. Vehículo: {vehicle_plate}.",
                link="/delivery",
            )
            sent += 1

        if trip.driver_id:
            coordinators = await _driver_coordinators(db, trip.driver_id, trip.tenant_id)
            driver_name = driver_user.full_name if driver_user else (driver.full_name if driver else "Chofer")
            for coord in coordinators:
                subject, html = build_trip_assigned_coordinator_email(
                    driver_name=driver_name, document=doc, stops_count=trip.stops_count,
                    vehicle_plate=vehicle_plate, date_str=date_str, frontend_url=settings.FRONTEND_URL,
                )
                if coord.email:
                    send_email(coord.email, subject, html)
                await _add_notification(db, trip.tenant_id, coord.id,
                    title=f"Nuevo reparto — {driver_name}",
                    body=f"{driver_name} tiene un nuevo reparto ({doc}) para el {date_str}.",
                    link=f"/trips/{trip.id}",
                )
                sent += 1

        return {"ok": True, "sent": sent}


@celery_app.task(name="app.tasks.notifications.notify_trip_started")
def notify_trip_started(trip_id: str) -> dict:
    """Notifica a los coordinadores cuando un chofer inicia un reparto."""
    return asyncio.run(_async_notify_trip_started(trip_id))


async def _async_notify_trip_started(trip_id: str) -> dict:
    async with _task_db() as db:
        trip = (await db.execute(select(Trip).where(Trip.id == uuid.UUID(trip_id)))).scalar_one_or_none()
        if not trip or not trip.driver_id:
            return {"error": "trip not found or no driver"}

        driver = (await db.execute(select(Driver).where(Driver.id == trip.driver_id))).scalar_one_or_none()
        driver_user = None
        if driver and driver.user_id:
            driver_user = (await db.execute(select(User).where(User.id == driver.user_id))).scalar_one_or_none()

        driver_name = driver_user.full_name if driver_user else (driver.full_name if driver else "Chofer")
        doc = trip.associated_document or "Reparto del día"
        started_at = trip.start_time.strftime("%H:%M") if trip.start_time else "ahora"

        coordinators = await _driver_coordinators(db, trip.driver_id, trip.tenant_id)
        sent = 0
        for coord in coordinators:
            subject, html = build_trip_started_email(
                driver_name=driver_name, document=doc,
                started_at=started_at, frontend_url=settings.FRONTEND_URL,
            )
            if coord.email:
                send_email(coord.email, subject, html)
            await _add_notification(db, trip.tenant_id, coord.id,
                title=f"Reparto iniciado — {driver_name}",
                body=f"{driver_name} inició el reparto {doc} a las {started_at}.",
                link=f"/trips/{trip.id}",
            )
            sent += 1

        return {"ok": True, "sent": sent}


@celery_app.task(name="app.tasks.notifications.notify_trip_completed")
def notify_trip_completed(trip_id: str) -> dict:
    """Notifica a coordinadores y admins cuando se completa un reparto."""
    return asyncio.run(_async_notify_trip_completed(trip_id))


async def _async_notify_trip_completed(trip_id: str) -> dict:
    async with _task_db() as db:
        trip = (await db.execute(select(Trip).where(Trip.id == uuid.UUID(trip_id)))).scalar_one_or_none()
        if not trip:
            return {"error": "trip not found"}

        driver = None
        driver_user = None
        if trip.driver_id:
            driver = (await db.execute(select(Driver).where(Driver.id == trip.driver_id))).scalar_one_or_none()
            if driver and driver.user_id:
                driver_user = (await db.execute(select(User).where(User.id == driver.user_id))).scalar_one_or_none()

        driver_name = driver_user.full_name if driver_user else (driver.full_name if driver else "Chofer")
        doc = trip.associated_document or "Reparto del día"
        km_driven = (trip.end_odometer - trip.start_odometer) if trip.end_odometer and trip.start_odometer else None

        admins = await _users_by_roles(db, trip.tenant_id, ["Administrador"])
        coordinators: list[User] = []
        if trip.driver_id:
            coordinators = await _driver_coordinators(db, trip.driver_id, trip.tenant_id)

        recipients: dict[uuid.UUID, User] = {u.id: u for u in admins + coordinators}
        sent = 0
        for user in recipients.values():
            subject, html = build_trip_completed_email(
                driver_name=driver_name, document=doc,
                km_driven=km_driven, frontend_url=settings.FRONTEND_URL,
            )
            if user.email:
                send_email(user.email, subject, html)
            km_text = f" · {km_driven} km recorridos" if km_driven else ""
            await _add_notification(db, trip.tenant_id, user.id,
                title=f"Reparto completado — {driver_name}",
                body=f"{driver_name} completó el reparto {doc}{km_text}.",
                link=f"/trips/{trip.id}",
            )
            sent += 1

        return {"ok": True, "sent": sent}


# ─── Tareas programadas ────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.notifications.daily_trips_summary")
def daily_trips_summary() -> dict:
    """Resumen diario de viajes enviado a admins y coordinadores de cada tenant."""
    return asyncio.run(_async_daily_trips_summary())


async def _async_daily_trips_summary() -> dict:
    async with _task_db() as db:
        tenants = (await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all()
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        total_sent = 0

        for tenant in tenants:
            trips = (await db.execute(
                select(Trip).where(Trip.tenant_id == tenant.id, Trip.created_at >= today_start)
            )).scalars().all()
            if not trips:
                continue

            completed = [t for t in trips if t.status == EstadoViaje.COMPLETADO]
            in_progress = [t for t in trips if t.status == EstadoViaje.EN_CURSO]
            pending = [t for t in trips if t.status == EstadoViaje.PENDIENTE]

            trip_rows = []
            for t in trips:
                driver_name = "—"
                if t.driver_id:
                    drv = (await db.execute(select(Driver).where(Driver.id == t.driver_id))).scalar_one_or_none()
                    if drv:
                        driver_name = drv.full_name
                km = (t.end_odometer - t.start_odometer) if t.end_odometer and t.start_odometer else None
                status_val = t.status.value if hasattr(t.status, "value") else str(t.status)
                trip_rows.append({"doc": t.associated_document or "Sin doc.", "driver": driver_name, "status": status_val, "km": km})

            recipients = await _users_by_roles(db, tenant.id, ["Administrador", "Coordinador de viajes"])
            for user in recipients:
                if user.email:
                    subject, html = build_daily_summary_email(
                        tenant_name=tenant.name, completed=len(completed),
                        in_progress=len(in_progress), pending=len(pending),
                        trip_rows=trip_rows, frontend_url=settings.FRONTEND_URL,
                    )
                    send_email(user.email, subject, html)
                    total_sent += 1

        return {"ok": True, "tenants": len(tenants), "emails_sent": total_sent}


@celery_app.task(name="app.tasks.notifications.daily_maintenance_alerts")
def daily_maintenance_alerts() -> dict:
    """Alertas diarias de mantenimiento: neumáticos y licencias próximas a vencer."""
    return asyncio.run(_async_daily_maintenance_alerts())


async def _async_daily_maintenance_alerts() -> dict:
    from datetime import date
    async with _task_db() as db:
        tenants = (await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all()
        today = datetime.now(timezone.utc).date()
        total_sent = 0

        for tenant in tenants:
            alerts: list[dict] = []

            tires = (await db.execute(
                select(Tire).where(Tire.tenant_id == tenant.id, Tire.status == "en_uso", Tire.km_limit.isnot(None))
            )).scalars().all()
            for tire in tires:
                remaining = (tire.km_limit or 0) - tire.current_km
                if remaining <= 2000:
                    vehicle = (await db.execute(select(Vehicle).where(Vehicle.id == tire.vehicle_id))).scalar_one_or_none()
                    plate = vehicle.plate if vehicle else "?"
                    alerts.append({
                        "type": "Neumático",
                        "entity": plate,
                        "detail": f"Posición {tire.position} — quedan {remaining:,} km",
                        "severity": "danger" if remaining <= 500 else "warning",
                    })

            drivers = (await db.execute(
                select(Driver).where(Driver.tenant_id == tenant.id, Driver.status == "activo", Driver.license_expiry.isnot(None))
            )).scalars().all()
            for driver in drivers:
                expiry = driver.license_expiry
                if hasattr(expiry, "date"):
                    expiry = expiry.date()
                elif isinstance(expiry, str):
                    expiry = date.fromisoformat(str(expiry)[:10])
                days_left = (expiry - today).days
                if days_left <= 30:
                    alerts.append({
                        "type": "Licencia de chofer",
                        "entity": driver.full_name,
                        "detail": f"Vence el {expiry.strftime('%d/%m/%Y')} ({max(days_left, 0)} días)",
                        "severity": "danger" if days_left <= 7 else "warning",
                    })

            if not alerts:
                continue

            recipients = await _users_by_roles(db, tenant.id, ["Administrador", "Encargado de mantenimiento"])
            for user in recipients:
                if user.email:
                    subject, html = build_maintenance_alerts_email(
                        tenant_name=tenant.name, alerts=alerts, frontend_url=settings.FRONTEND_URL,
                    )
                    send_email(user.email, subject, html)
                await _add_notification(db, tenant.id, user.id,
                    title=f"{len(alerts)} alerta{'s' if len(alerts) > 1 else ''} de mantenimiento",
                    body="Revisá las alertas pendientes en Fleet Manager.",
                    link="/maintenance", notification_type="vencimiento_neumatico",
                )
                total_sent += 1

        return {"ok": True, "tenants": len(tenants), "emails_sent": total_sent}


# Alias de compatibilidad
check_expirations = daily_maintenance_alerts
