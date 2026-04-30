"""Importa todos los modelos para que Alembic los detecte al generar migraciones."""

from app.models.tenant import Tenant
from app.models.client import Client
from app.models.user import User, Role, Permission, role_permissions
from app.models.vehicle import Vehicle
from app.models.machine import Machine
from app.models.driver import Driver
from app.models.maintenance import MaintenanceService, MaintenanceRecord
from app.models.tire import Tire
from app.models.trip import Trip
from app.models.supplier import Supplier
from app.models.quote import Quote
from app.models.work_order import WorkOrder
from app.models.gps import GpsConfig, GpsReading
from app.models.notification import Notification
from app.models.coordinator import CoordinatorAssignment
from app.models.fleet_assignment import FleetAssignment

__all__ = [
    "Tenant",
    "Client",
    "User",
    "Role",
    "Permission",
    "role_permissions",
    "Vehicle",
    "Machine",
    "Driver",
    "MaintenanceService",
    "MaintenanceRecord",
    "Tire",
    "Trip",
    "Supplier",
    "Quote",
    "WorkOrder",
    "GpsConfig",
    "GpsReading",
    "Notification",
    "CoordinatorAssignment",
    "FleetAssignment",
]
