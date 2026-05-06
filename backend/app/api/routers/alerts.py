"""Router de alertas de mantenimiento personalizadas por usuario."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select, func, or_, and_

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
                    type="tire_overdue", severity="danger",
                    entity_type="vehicle", entity_id=vehicle.id, entity_name=vehicle.plate,
                    title=f"Neumático vencido — {vehicle.plate}",
                    detail=f"Posición {tire.position}: {tire.current_km:,} km / límite {tire.km_limit:,} km",
                ))
            elif ratio >= 0.8:
                alerts.append(Alert(
                    type="tire_warning", severity="warning",
                    entity_type="vehicle", entity_id=vehicle.id, entity_name=vehicle.plate,
                    title=f"Neumático próximo al límite — {vehicle.plate}",
                    detail=f"Posición {tire.position}: faltan {km_restantes:,} km",
                ))

    # ── Subqueries de último registro ─────────────────────────────────────────
    # Por vehículo: último registro agrupado por (vehicle_id, service_id)
    v_latest_sq = (
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

    # Por máquina: odometer_at_service se usa como "horas al momento del service"
    m_latest_sq = (
        select(
            MaintenanceRecord.machine_id,
            MaintenanceRecord.service_id,
            func.max(MaintenanceRecord.service_date).label("last_date"),
            func.max(MaintenanceRecord.odometer_at_service).label("last_hours"),
        )
        .where(MaintenanceRecord.tenant_id == tid, MaintenanceRecord.machine_id.isnot(None))
        .group_by(MaintenanceRecord.machine_id, MaintenanceRecord.service_id)
        .subquery()
    )

    # ── Alertas de services — vehículos (km + días) ───────────────────────────
    svc_v_q = (
        select(
            MaintenanceService,
            v_latest_sq.c.vehicle_id,
            v_latest_sq.c.last_date,
            v_latest_sq.c.last_km,
            Vehicle.plate,
            Vehicle.odometer,
        )
        .join(v_latest_sq, MaintenanceService.id == v_latest_sq.c.service_id)
        .join(Vehicle, Vehicle.id == v_latest_sq.c.vehicle_id)
        .where(
            or_(
                MaintenanceService.applies_to.in_(["vehiculo", "ambos"]),
                MaintenanceService.applies_to == Vehicle.vehicle_type,
            )
        )
    )
    if vehicle_scope is not None:
        if not vehicle_scope:
            svc_v_q = None
        else:
            svc_v_q = svc_v_q.where(v_latest_sq.c.vehicle_id.in_(vehicle_scope))

    if svc_v_q is not None:
        for svc, v_id, last_date, last_km, plate, odometer in (await db.execute(svc_v_q)).all():
            # Por días
            if svc.interval_days and last_date:
                due_date = last_date + timedelta(days=svc.interval_days)
                days_left = (due_date - today).days
                if days_left <= 0:
                    alerts.append(Alert(
                        type="service_overdue", severity="danger",
                        entity_type="vehicle", entity_id=v_id, entity_name=plate,
                        title=f"Service vencido — {plate}",
                        detail=f"{svc.name}: venció hace {abs(days_left)} día(s)",
                    ))
                elif days_left <= 30:
                    alerts.append(Alert(
                        type="service_due_soon", severity="warning",
                        entity_type="vehicle", entity_id=v_id, entity_name=plate,
                        title=f"Service próximo — {plate}",
                        detail=f"{svc.name}: vence en {days_left} día(s)",
                    ))

            # Por km
            if svc.interval_km and last_km is not None and odometer is not None:
                km_left = (last_km + svc.interval_km) - odometer
                if km_left <= 0:
                    alerts.append(Alert(
                        type="service_overdue_km", severity="danger",
                        entity_type="vehicle", entity_id=v_id, entity_name=plate,
                        title=f"Service vencido por km — {plate}",
                        detail=f"{svc.name}: excedido en {abs(km_left):,} km",
                    ))
                elif km_left <= svc.interval_km * 0.2:
                    alerts.append(Alert(
                        type="service_due_soon_km", severity="warning",
                        entity_type="vehicle", entity_id=v_id, entity_name=plate,
                        title=f"Service próximo por km — {plate}",
                        detail=f"{svc.name}: faltan {km_left:,} km",
                    ))

    # ── Alertas de services — máquinas (horas + días) ─────────────────────────
    svc_m_q = (
        select(
            MaintenanceService,
            m_latest_sq.c.machine_id,
            m_latest_sq.c.last_date,
            m_latest_sq.c.last_hours,
            Machine.name,
            Machine.hours_used,
        )
        .join(m_latest_sq, MaintenanceService.id == m_latest_sq.c.service_id)
        .join(Machine, Machine.id == m_latest_sq.c.machine_id)
        .where(MaintenanceService.applies_to.in_(["maquina", "ambos"]))
    )
    if machine_scope is not None:
        if not machine_scope:
            svc_m_q = None
        else:
            svc_m_q = svc_m_q.where(m_latest_sq.c.machine_id.in_(machine_scope))

    if svc_m_q is not None:
        for svc, m_id, last_date, last_hours, mname, hours_used in (await db.execute(svc_m_q)).all():
            # Por horas
            if svc.interval_hours and last_hours is not None:
                hours_left = (last_hours + svc.interval_hours) - hours_used
                if hours_left <= 0:
                    alerts.append(Alert(
                        type="service_overdue_hours", severity="danger",
                        entity_type="machine", entity_id=m_id, entity_name=mname,
                        title=f"Service vencido — {mname}",
                        detail=f"{svc.name}: excedido en {abs(hours_left):,} hs",
                    ))
                elif hours_left <= svc.interval_hours * 0.2:
                    alerts.append(Alert(
                        type="service_due_soon_hours", severity="warning",
                        entity_type="machine", entity_id=m_id, entity_name=mname,
                        title=f"Service próximo — {mname}",
                        detail=f"{svc.name}: faltan {hours_left:,} hs",
                    ))

            # Por días
            if svc.interval_days and last_date:
                due_date = last_date + timedelta(days=svc.interval_days)
                days_left = (due_date - today).days
                if days_left <= 0:
                    alerts.append(Alert(
                        type="service_overdue", severity="danger",
                        entity_type="machine", entity_id=m_id, entity_name=mname,
                        title=f"Service vencido — {mname}",
                        detail=f"{svc.name}: venció hace {abs(days_left)} día(s)",
                    ))
                elif days_left <= 30:
                    alerts.append(Alert(
                        type="service_due_soon", severity="warning",
                        entity_type="machine", entity_id=m_id, entity_name=mname,
                        title=f"Service próximo — {mname}",
                        detail=f"{svc.name}: vence en {days_left} día(s)",
                    ))

    # ── Alertas de "sin historial" ─────────────────────────────────────────────
    # Vehículos con services aplicables pero sin ningún registro

    if vehicle_scope is None or vehicle_scope:
        v_services_with_interval = (await db.execute(
            select(MaintenanceService).where(
                MaintenanceService.tenant_id == tid,
                MaintenanceService.applies_to.in_(["vehiculo", "ambos", "camion", "camioneta"]),
                or_(
                    MaintenanceService.interval_km.isnot(None),
                    MaintenanceService.interval_days.isnot(None),
                ),
            )
        )).scalars().all()

        if v_services_with_interval:
            v_q = select(Vehicle).where(Vehicle.tenant_id == tid, Vehicle.status != "baja")
            if vehicle_scope:
                v_q = v_q.where(Vehicle.id.in_(vehicle_scope))
            active_vehicles = (await db.execute(v_q)).scalars().all()

            existing_v_pairs: set[tuple] = set(
                (await db.execute(
                    select(MaintenanceRecord.vehicle_id, MaintenanceRecord.service_id)
                    .where(MaintenanceRecord.tenant_id == tid, MaintenanceRecord.vehicle_id.isnot(None))
                    .distinct()
                )).all()
            )

            for vehicle in active_vehicles:
                for svc in v_services_with_interval:
                    # Si el service es de subtipo específico, verificar que coincida
                    if svc.applies_to not in ("vehiculo", "ambos") and svc.applies_to != vehicle.vehicle_type:
                        continue
                    if (vehicle.id, svc.id) not in existing_v_pairs:
                        alerts.append(Alert(
                            type="service_no_history", severity="warning",
                            entity_type="vehicle", entity_id=vehicle.id, entity_name=vehicle.plate,
                            title=f"Sin historial de service — {vehicle.plate}",
                            detail=f"{svc.name}: nunca fue registrado para este vehículo",
                        ))

    # Máquinas con services aplicables pero sin ningún registro
    if machine_scope is None or machine_scope:
        m_services_with_interval = (await db.execute(
            select(MaintenanceService).where(
                MaintenanceService.tenant_id == tid,
                MaintenanceService.applies_to.in_(["maquina", "ambos"]),
                or_(
                    MaintenanceService.interval_hours.isnot(None),
                    MaintenanceService.interval_days.isnot(None),
                ),
            )
        )).scalars().all()

        if m_services_with_interval:
            m_q = select(Machine).where(Machine.tenant_id == tid, Machine.status != "baja")
            if machine_scope:
                m_q = m_q.where(Machine.id.in_(machine_scope))
            active_machines = (await db.execute(m_q)).scalars().all()

            existing_m_pairs: set[tuple] = set(
                (await db.execute(
                    select(MaintenanceRecord.machine_id, MaintenanceRecord.service_id)
                    .where(MaintenanceRecord.tenant_id == tid, MaintenanceRecord.machine_id.isnot(None))
                    .distinct()
                )).all()
            )

            for machine in active_machines:
                for svc in m_services_with_interval:
                    if (machine.id, svc.id) not in existing_m_pairs:
                        alerts.append(Alert(
                            type="service_no_history", severity="warning",
                            entity_type="machine", entity_id=machine.id, entity_name=machine.name,
                            title=f"Sin historial de service — {machine.name}",
                            detail=f"{svc.name}: nunca fue registrado para esta máquina",
                        ))

    # Ordenar: danger primero, luego warning; dentro de cada grupo por nombre
    alerts.sort(key=lambda a: (0 if a.severity == "danger" else 1, a.entity_name))
    return AlertsResponse(alerts=alerts, total=len(alerts))
