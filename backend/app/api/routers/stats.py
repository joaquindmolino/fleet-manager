"""Router de estadísticas para el dashboard."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select, func

from app.api.dependencies import CurrentUser, DbSession
from app.models.driver import Driver
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.models.work_order import WorkOrder

router = APIRouter(prefix="/stats", tags=["stats"])


class DashboardStats(BaseModel):
    vehicles_activos: int
    ordenes_abiertas: int
    trips_en_curso: int
    trips_pendientes: int
    trips_planificados: int
    choferes_activos: int


@router.get("/dashboard", response_model=DashboardStats)
async def get_dashboard_stats(current_user: CurrentUser, db: DbSession) -> DashboardStats:
    """Retorna métricas generales de la flota para el dashboard."""
    tid = current_user.tenant_id

    vehicles_activos = (
        await db.execute(
            select(func.count())
            .select_from(Vehicle)
            .where(Vehicle.tenant_id == tid, Vehicle.status != "baja")
        )
    ).scalar_one()

    ordenes_abiertas = (
        await db.execute(
            select(func.count())
            .select_from(WorkOrder)
            .where(WorkOrder.tenant_id == tid, WorkOrder.status.in_(["abierta", "en_progreso"]))
        )
    ).scalar_one()

    trips_en_curso = (
        await db.execute(
            select(func.count())
            .select_from(Trip)
            .where(Trip.tenant_id == tid, Trip.status == "en_curso")
        )
    ).scalar_one()

    trips_pendientes = (
        await db.execute(
            select(func.count())
            .select_from(Trip)
            .where(Trip.tenant_id == tid, Trip.status == "pendiente")
        )
    ).scalar_one()

    trips_planificados = (
        await db.execute(
            select(func.count())
            .select_from(Trip)
            .where(Trip.tenant_id == tid, Trip.status == "planificado")
        )
    ).scalar_one()

    choferes_activos = (
        await db.execute(
            select(func.count())
            .select_from(Driver)
            .where(Driver.tenant_id == tid, Driver.status == "activo")
        )
    ).scalar_one()

    return DashboardStats(
        vehicles_activos=vehicles_activos,
        ordenes_abiertas=ordenes_abiertas,
        trips_en_curso=trips_en_curso,
        trips_pendientes=trips_pendientes,
        trips_planificados=trips_planificados,
        choferes_activos=choferes_activos,
    )
