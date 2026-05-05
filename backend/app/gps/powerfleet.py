"""Conector para la API REST de Powerfleet Unity."""

import time
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

TOKEN_TTL = 3300       # 55 minutos por defecto (ajustar si el proveedor indica otro)
TOKEN_BUFFER = 60      # refrescar 60s antes del vencimiento

# Caché de tokens en memoria: config_id → (token, expires_at)
_token_cache: dict[str, tuple[str, float]] = {}


@dataclass
class VehiclePosition:
    powerfleet_id: str
    name: str
    license_plate: str | None
    make: str | None
    model: str | None
    latitude: float | None
    longitude: float | None
    speed: float | None
    direction: float | None
    ignition_on: bool | None
    odometer: float | None
    address: str | None
    last_update: str | None
    vehicle_id: str | None = field(default=None)


def _extract_token(data: dict) -> tuple[str, float]:
    """Extrae el token y el tiempo de expiración de la respuesta de login."""
    # Formato OAuth2 estándar: {"access_token": "...", "expires_in": 3600}
    if "access_token" in data:
        expires_in = float(data.get("expires_in") or TOKEN_TTL)
        return data["access_token"], time.time() + expires_in

    # Formato Powerfleet Unity con wrapper: {"data": {"token": "..."}, "isSucceded": true}
    inner = data.get("data")
    if isinstance(inner, dict):
        token = inner.get("token") or inner.get("access_token")
        if token:
            return token, time.time() + TOKEN_TTL

    # Fallback: campo "token" directo en la raíz
    if "token" in data:
        return data["token"], time.time() + TOKEN_TTL

    raise ValueError(
        f"No se encontró token en la respuesta del servidor. Campos recibidos: {list(data.keys())}"
    )


async def _authenticate(base_url: str, username: str, password: str) -> tuple[str, float]:
    """Autentica contra Powerfleet Unity y retorna (token, expires_at)."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{base_url.rstrip('/')}/Fleetcore.Api/token",
            json={"username": username, "password": password, "langId": 1},
        )
        r.raise_for_status()
        return _extract_token(r.json())


async def _get_valid_token(config_id: str, base_url: str, username: str, password: str) -> str:
    """Devuelve un access_token válido, refrescando automáticamente si está por vencer."""
    cached = _token_cache.get(config_id)
    if cached:
        token, expires_at = cached
        if time.time() < expires_at - TOKEN_BUFFER:
            return token

    token, expires_at = await _authenticate(base_url, username, password)
    _token_cache[config_id] = (token, expires_at)
    return token


async def validate_credentials(base_url: str, username: str, password: str) -> None:
    """Valida las credenciales contra Powerfleet Unity. Lanza excepción si fallan."""
    await _authenticate(base_url, username, password)


def _normalize_plate(plate: str | None) -> str:
    if not plate:
        return ""
    return plate.upper().replace(" ", "").replace("-", "")


def _vstate_to_ignition(v_state: str | None) -> bool | None:
    """Convierte el estado del vehículo a encendido/apagado."""
    if v_state is None:
        return None
    return v_state.lower() not in ("dormant", "inactive", "off")


async def get_vehicle_positions(
    config_id: str,
    base_url: str,
    username: str,
    password: str,
    plate_to_vehicle_id: dict[str, str],
) -> list[VehiclePosition]:
    """
    Obtiene la posición en tiempo real de todos los vehículos desde Powerfleet Unity.
    plate_to_vehicle_id: {patente_normalizada → UUID interno del vehículo}.
    """
    token = await _get_valid_token(config_id, base_url, username, password)

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.get(
            f"{base_url.rstrip('/')}/Fleetcore.api/api/fleetview/vehicles",
            headers={"Authorization": f"Bearer {token}"},
        )
        r.raise_for_status()
        payload = r.json()

    if not payload.get("isSucceded"):
        raise ValueError(f"Error de API Powerfleet: {payload.get('error')}")

    fleet = payload.get("data", {}).get("fleet", {})
    positions: list[VehiclePosition] = []

    for group in fleet.get("groups", []):
        for v in group.get("vehicles", []):
            plate = v.get("licensePlate")
            plate_key = _normalize_plate(plate)
            odometer = v.get("odometer")

            positions.append(VehiclePosition(
                powerfleet_id=str(v.get("id", "")),
                name=plate or v.get("serialNumber") or str(v.get("id", "")),
                license_plate=plate,
                make=None,
                model=None,
                latitude=v.get("lat"),
                longitude=v.get("lng"),
                speed=v.get("speed"),
                direction=v.get("direction"),
                ignition_on=_vstate_to_ignition(v.get("vState")),
                odometer=odometer if odometer else None,
                address=v.get("address"),
                last_update=v.get("gpsDateTime") or v.get("reportTime"),
                vehicle_id=plate_to_vehicle_id.get(plate_key) if plate_key else None,
            ))

    return positions


def invalidate_token_cache(config_id: str) -> None:
    """Limpia el token cacheado para forzar re-autenticación en el próximo request."""
    _token_cache.pop(config_id, None)
