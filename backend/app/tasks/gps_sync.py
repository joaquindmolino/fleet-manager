"""Tareas Celery para sincronización de datos GPS de todos los tenants."""

from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.gps_sync.sync_all_tenants")
def sync_all_tenants() -> dict:
    """
    Itera todos los tenants con GPS configurado y activo,
    y dispara sync_tenant_gps para cada uno.
    """
    # TODO: consultar gps_configs activos y encolar sync por tenant
    return {"status": "ok", "tenants_queued": 0}


@celery_app.task(name="app.tasks.gps_sync.sync_tenant_gps")
def sync_tenant_gps(tenant_id: str, gps_config_id: str) -> dict:
    """
    Sincroniza las lecturas GPS de un tenant específico.
    Llama al conector correspondiente según el proveedor configurado,
    guarda las lecturas en gps_readings y actualiza el odómetro del vehículo.
    """
    # TODO: instanciar el conector GPS según gps_config.provider
    return {"status": "ok", "tenant_id": tenant_id, "readings_saved": 0}
