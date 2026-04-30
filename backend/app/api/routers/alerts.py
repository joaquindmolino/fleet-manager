"""Router de alertas de mantenimiento personalizadas por usuario."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession
from app.models.coordinator import CoordinatorAssignment
from app.models.driver import Driver
from app.models.fleet_assignment import FleetAssignment
from app.models.machine import Machine
from app.models.maintenance import MaintenanceRecord, MaintenanceService
from app.models.tire import Tire
from app.models.vehicle import Vehicle

router = APIRouter(prefix="/alerts", tags=["alerts"])


class Alert(BaseModel):
    type: str
    severity: str  # "warning" | "danger"
    entity_type: str  # "vehicle" | "machine"
    entity_id: uuid.UUID
    entity_name: str
    title: str
    detail: str | None = None


class AlertsResponse(BaseModel):
    alerts: list[Alert]
    total: int


async def _get_scope(
    current_user, db
) -> tuple[list[uuid.UUID] | None, list[uuid.UUID] | None]:
    """
    Retorna (vehicle_ids, machine_ids) para el scope del usuario.
    None = todos. [] = ninguno (sin alerts de ese tipo).
    """
    tid = current_user.tenant_id

    # Chofer: solo su vehículo
    driver = (await db.execute(
        select(Driver).where(Driver.user_id == current_user.id, Driver.tenant_id == tid)
    )).scalar_one_or_none()
    if driver is not None:
        return ([driver.vehicle_id] if driver.vehicle_id else [], [])

    # Operario: sus máquinas asignadas
    my_machines = (await db.execute(
        select(Machine.id).where(Machine.assigned_user_id == current_user.id, Machine.tenant_id == tid)
    )).scalars().all()
    if my_machines:
        return ([], list(my_machines))

    # Coordinador de viajes: vehículos de su equipo
    coord_driver_ids = (await db.execute(
        select(CoordinatorAssignment.driver_id).where(
            CoordinatorAssignment.coordinator_user_id == current_user.id,
            CoordinatorAssignment.tenant_id == tid,
        )
    )).scalars().all()
    if coord_driver_ids:
        v_ids = (await db.execute(
            select(Driver.vehicle_id).where(Driver.id.in_(coord_driver_ids), Driver.vehicle_id.isnot(None))
        )).scalars().all()
        return (list(v_ids), [])

    # Encargado con flota asignada
    fleet_vids = (await db.execute(
        select(FleetAssignment.vehicle_id).where(
            FleetAssignment.user_id == current_user.id,
            FleetAssignment.tenant_id == tid,
            FleetAssignment.vehicle_id.isnot(None),
        )
    )).scalars().all()
    fleet_mids = (await db.execute(
        select(FleetAssignment.machine_id).where(
            FleetAssignment.user_id == current_user.id,
            FleetAssignment.tenant_id == tid,
            FleetAssignment.machine_id.isnot(None),
        )
    )).scalars().all()
    if fleet_vids or fleet_mids:
        return (list(fleet_vids), list(fleet_mids))

    # Admin / acceso total
    return (None, None)


@router.get("/me", response_model=AlertsResponse)
async def get_my_alerts(current_user: CurrentUser, db: DbSession) -> AlertsResponse:
    """Retorna las alertas de mantenimiento relevantes para el usuario autenticado."""
    tid = current_user.tenant_id
    vehicle_scope, machine_scope = await _get_scope(current_user, db)
    alerts: list[Alert] = []
    today = date.today()

    # ── Alertas de neumáticos ──────────────────────────────────────────────────
    tire_q = select(Tire, Vehicle).join(Vehicle, Tire.vehicle_id == Vehicle.id).where(
        Tire.tenant_id == tid,
        Tire.status == "en_uso",
        Tire.km_limit.isnot(None),
        Tire.km_limit > 0,
    )
    if vehicle_scope is not None:
        if not vehicle_scope:
            tire_q = None
        else:
            tire_q = tire_q.where(Tire.vehicle_id.in_(vehicle_scope))

    if tire_q is not None:
        for tire, vehicle in (await db.execute(tire_q)).all():
            ratio = tire.current_km / tire.km_limit
            km_restantes = tire.km_limit - tire.current_km
            if ratio >= 1.0:
                alerts.append(Alert(
                    type="tire_overdue",
                    severity="danger",
                    entity_type="vehicle",
                    entity_id=vehicle.id,
                    entity_name=vehicle.plate,
                    title=f"Neumático vencido — {vehicle.plate}",
                    detail=f"Posición {tire.position}: {tire.current_km:,} km / límite {tire.km_limit:,} km",
                ))
            elif ratio >= 0.8:
                alerts.append(Alert(
                    type="tire_warning",
                    severity="warning",
                    entity_type="vehicle",
                    entity_id=vehicle.id,
                    entity_name=vehicle.plate,
                    title=f"Neumático próximo al límite — {vehicle.plate}",
                    detail=f"Posición {tire.position}: faltan {km_restantes:,} km",
                ))

    # ── Alertas de services (por fecha) ───────────────────────────────────────
    # Subquery: última fecha de service por (vehicle_id, service_id)
    latest_sq = (
        select(
            MaintenanceRecord.vehicle_id,
            MaintenanceRecord.service_id,
            func.max(MaintenanceRecord.service_date).label("last_date"),
            func.max(MaintenanceRecord.odometer_at_service).label("last_km"),
        )
        .where(MaintenanceRecord.tenant_id == tid, MaintenanceRecord.vehicle_id.isnot(None))
        .group_by(MaintenanceRecord.vehicle_id, MaintenanceRecord.service_id)
        .subquery()
    )

    svc_q = (
        select(MaintenanceService, latest_sq.c.vehicle_id, latest_sq.c.last_date, latest_sq.c.last_km, Vehicle.plate, Vehicle.odometer)
        .join(latest_sq, MaintenanceService.id == latest_sq.c.service_id)
        .join(Vehicle, Vehicle.id == latest_sq.c.vehicle_id)
        .where(MaintenanceService.interval_days.isnot(None))
    )
    if vehicle_scope is not None:
        if not vehicle_scope:
            svc_q = None
        else:
            svc_q = svc_q.where(latest_sq.c.vehicle_id.in_(vehicle_scope))

    if svc_q is not None:
        for svc, v_id, last_date, last_km, plate, odometer in (await db.execute(svc_q)).all():
            due_date = last_date + timedelta(days=svc.interval_days)
            days_remaining = (due_date - today).days
            if days_remaining <= 0:
                alerts.append(Alert(
                    type="service_overdue",
                    severity="danger",
                    entity_type="vehicle",
                    entity_id=v_id,
                    entity_name=plate,
                    title=f"Service vencido — {plate}",
                    detail=f"{svc.name}: venció hace {abs(days_remaining)} día(s)",
                ))
            elif days_remaining <= 30:
                alerts.append(Alert(
                    type="service_due_soon",
                    severity="warning",
                    entity_type="vehicle",
                    entity_id=v_id,
                    entity_name=plate,
                    title=f"Service próximo — {plate}",
                    detail=f"{svc.name}: vence en {days_remaining} día(s)",
                ))

            # También chequear por km si corresponde
            if svc.interval_km and last_km is not None and odometer is not None:
                next_km = last_km + svc.interval_km
                km_remaining = next_km - odometer
                if km_remaining <= 0:
                    alerts.append(Alert(
                        type="service_overdue_km",
                        severity="danger",
                        entity_type="vehicle",
                        entity_id=v_id,
                        entity_name=plate,
                        title=f"Service vencido por km — {plate}",
                        detail=f"{svc.name}: excedido en {abs(km_remaining):,} km",
                    ))
                elif km_remaining <= svc.interval_km * 0.2:
                    alerts.append(Alert(
                        type="service_due_soon_km",
                        severity="warning",
                        entity_type="vehicle",
                        entity_id=v_id,
                        entity_name=plate,
                        title=f"Service próximo por km — {plate}",
                        detail=f"{svc.name}: faltan {km_remaining:,} km",
                    ))

    # Ordenar: danger primero, luego warning
    alerts.sort(key=lambda a: (0 if a.severity == "danger" else 1, a.entity_name))
    return AlertsResponse(alerts=alerts, total=len(alerts))
