"""Conector para la API GraphQL de PowerFleet (Fleet Complete)."""

import time
import logging
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

POWERFLEET_BASE = "https://api.fleetcomplete.com"
TOKEN_TTL = 300  # segundos — el token expira en 5 min
TOKEN_BUFFER = 40  # refrescar 40s antes del vencimiento

# Caché de tokens en memoria por config_id
_token_cache: dict[str, dict] = {}


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
    vehicle_id: str | None = field(default=None)  # UUID de nuestro vehículo si matchea por patente


async def _authenticate(username: str, password: str) -> dict:
    """Autentica contra PowerFleet y retorna el payload del token."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{POWERFLEET_BASE}/login/token",
            data={"username": username, "password": password},
        )
        r.raise_for_status()
        return r.json()


async def _refresh(refresh_token: str) -> dict:
    """Refresca el access_token usando el refresh_token."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"{POWERFLEET_BASE}/login/refresh",
            data={"refreshToken": refresh_token},
        )
        r.raise_for_status()
        return r.json()


async def _get_valid_token(config_id: str, username: str, password: str) -> str:
    """Devuelve un access_token válido, usando caché y refresh automático."""
    now = time.time()
    cached = _token_cache.get(config_id)

    if cached and cached["expires_at"] > now + TOKEN_BUFFER:
        return cached["access_token"]

    # Intentar refresh si tenemos un refresh_token
    if cached and cached.get("refresh_token"):
        try:
            data = await _refresh(cached["refresh_token"])
            _token_cache[config_id] = {
                "access_token": data["access_token"],
                "refresh_token": data.get("refresh_token", cached["refresh_token"]),
                "expires_at": now + TOKEN_TTL,
            }
            return _token_cache[config_id]["access_token"]
        except Exception as e:
            logger.warning("PowerFleet refresh falló, re-autenticando: %s", e)

    # Autenticación completa
    data = await _authenticate(username, password)
    _token_cache[config_id] = {
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token"),
        "expires_at": now + TOKEN_TTL,
    }
    return _token_cache[config_id]["access_token"]


async def fetch_user_id(username: str, password: str) -> str:
    """Autentica y obtiene el userId de PowerFleet. Usado al configurar la integración."""
    data = await _authenticate(username, password)
    access_token = data["access_token"]

    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(
            f"{POWERFLEET_BASE}/login/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        r.raise_for_status()
        users = r.json()
        if not users:
            raise ValueError("No se encontraron usuarios en la respuesta de PowerFleet")
        return users[0]["userId"]


_VEHICLES_QUERY = """
{
  getActiveVehicles {
    id
    name
    licensePlate
    make
    model
    lastOdometer
    latestData {
      timestamp
      gps {
        latitude
        longitude
        speed
        direction
      }
      ignition {
        engineStatus
      }
      address {
        address
        city
      }
    }
  }
}
"""


def _parse_ignition(ignition: dict | None) -> bool | None:
    if ignition is None:
        return None
    status = ignition.get("engineStatus")
    if isinstance(status, bool):
        return status
    if isinstance(status, str):
        return status.lower() in ("on", "true", "1", "running")
    return None


def _parse_address(address: dict | None) -> str | None:
    if not address:
        return None
    parts = [address.get("address"), address.get("city")]
    result = ", ".join(p for p in parts if p)
    return result or None


async def get_vehicle_positions(
    config_id: str,
    username: str,
    password: str,
    user_id: str,
    plate_to_vehicle_id: dict[str, str],
) -> list[VehiclePosition]:
    """
    Obtiene la posición en tiempo real de todos los vehículos activos.
    plate_to_vehicle_id: mapeo de patente (normalizada) → UUID de nuestro vehículo.
    """
    access_token = await _get_valid_token(config_id, username, password)

    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(
            f"{POWERFLEET_BASE}/graphql",
            headers={
                "Authorization": f"Bearer {access_token}",
                "userId": user_id,
                "Content-Type": "application/json",
            },
            json={"query": _VEHICLES_QUERY},
        )
        r.raise_for_status()
        payload = r.json()

    vehicles = payload.get("data", {}).get("getActiveVehicles", []) or []
    positions: list[VehiclePosition] = []

    for v in vehicles:
        latest = v.get("latestData") or {}
        gps = latest.get("gps") or {}
        plate = v.get("licensePlate")
        # Normalizar patente para el match (sin espacios, mayúsculas)
        plate_key = plate.upper().replace(" ", "").replace("-", "") if plate else None

        positions.append(VehiclePosition(
            powerfleet_id=v["id"],
            name=v.get("name") or "",
            license_plate=plate,
            make=v.get("make"),
            model=v.get("model"),
            latitude=gps.get("latitude"),
            longitude=gps.get("longitude"),
            speed=gps.get("speed"),
            direction=gps.get("direction"),
            ignition_on=_parse_ignition(latest.get("ignition")),
            odometer=v.get("lastOdometer"),
            address=_parse_address(latest.get("address")),
            last_update=latest.get("timestamp"),
            vehicle_id=plate_to_vehicle_id.get(plate_key) if plate_key else None,
        ))

    return positions


def invalidate_token_cache(config_id: str) -> None:
    """Limpia el token cacheado para forzar re-autenticación."""
    _token_cache.pop(config_id, None)
