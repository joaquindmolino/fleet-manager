"""Router de servicios de ruteo y geocoding (proxy a OpenRouteService).

La API key de ORS nunca se expone al frontend; siempre llamamos a ORS desde
acá usando settings.ORS_API_KEY.
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.dependencies import CurrentUser
from app.core.config import settings

router = APIRouter(prefix="/routing", tags=["routing"])


class AutocompleteSuggestion(BaseModel):
    label: str
    lat: float
    lng: float


class RouteRequest(BaseModel):
    coordinates: list[list[float]] = Field(..., min_length=2)  # [[lng, lat], ...]


async def _geocode_google(q: str, country: str) -> list[AutocompleteSuggestion]:
    """Geocoding via Google Maps Geocoding API. Mejor cobertura de alturas
    en Argentina y muy resiliente a errores de tipeo. Pago según uso (free
    tier ~40k requests/mes)."""
    params = {
        "address": q,
        "key": settings.GOOGLE_MAPS_API_KEY,
        "language": "es",
    }
    if country:
        params["components"] = f"country:{country.upper()}"
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params=params,
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Google Geocoding respondió {response.status_code}",
        )
    data = response.json()
    api_status = data.get("status")
    # ZERO_RESULTS no es error, solo falta de resultados
    if api_status in ("OK", "ZERO_RESULTS"):
        suggestions: list[AutocompleteSuggestion] = []
        for item in data.get("results", []):
            label = item.get("formatted_address")
            loc = item.get("geometry", {}).get("location", {})
            try:
                lat = float(loc["lat"])
                lng = float(loc["lng"])
            except (KeyError, ValueError, TypeError):
                continue
            if label:
                suggestions.append(AutocompleteSuggestion(label=label, lat=lat, lng=lng))
        return suggestions
    # OVER_QUERY_LIMIT, REQUEST_DENIED, INVALID_REQUEST, etc.
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Google Geocoding: {api_status} - {data.get('error_message', '')}",
    )


async def _geocode_nominatim(q: str, country: str) -> list[AutocompleteSuggestion]:
    """Geocoding via Nominatim (OpenStreetMap). Gratis, sin API key. Rate
    limited a ~1 req/seg y requiere User-Agent identificable."""
    params: dict = {
        "q": q,
        "format": "jsonv2",
        "limit": 10,
        "addressdetails": 0,
    }
    if country:
        params["countrycodes"] = country.lower()
    headers = {
        "User-Agent": "FleetManager/0.1 (contact: support@fleetmanager.app)",
        "Accept-Language": "es",
    }
    async with httpx.AsyncClient(timeout=8.0) as client:
        response = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params=params,
            headers=headers,
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Nominatim respondió {response.status_code}",
        )
    suggestions: list[AutocompleteSuggestion] = []
    for item in response.json():
        label = item.get("display_name")
        try:
            lat = float(item["lat"])
            lng = float(item["lon"])
        except (KeyError, ValueError, TypeError):
            continue
        if label:
            suggestions.append(AutocompleteSuggestion(label=label, lat=lat, lng=lng))
    return suggestions


@router.get("/autocomplete", response_model=list[AutocompleteSuggestion])
async def autocomplete(
    current_user: CurrentUser,
    q: str = Query(..., min_length=2, max_length=200),
    country: str = Query("ar", min_length=2, max_length=3),
) -> list[AutocompleteSuggestion]:
    """Sugerencias de direcciones.

    Si GOOGLE_MAPS_API_KEY está configurada, usa Google Geocoding (mejor
    cobertura de alturas, paga). Si no, fallback a Nominatim (OSM, gratis).
    Si Google falla en runtime, también cae a Nominatim para no dejar al
    coordinador sin sugerencias.
    """
    _ = current_user  # gatear el endpoint con auth
    if settings.GOOGLE_MAPS_API_KEY:
        try:
            return await _geocode_google(q, country)
        except HTTPException:
            # Fallback silencioso a Nominatim si Google falla
            pass
        except httpx.HTTPError:
            pass
    try:
        return await _geocode_nominatim(q, country)
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo contactar al servicio de geocoding: {exc}",
        )


@router.post("/route")
async def route(body: RouteRequest, current_user: CurrentUser) -> dict:
    """Devuelve la ruta vehicular para un set de coordenadas (sin DB).

    Útil para el preview en el planificador antes de guardar el viaje.
    Respuesta: { geometry: [[lat, lng], ...], distance_m, duration_s }
    """
    _ = current_user
    if not settings.ORS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de ruteo no configurado.",
        )
    if len(body.coordinates) < 2:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Se necesitan al menos 2 puntos.",
        )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
                headers={"Authorization": settings.ORS_API_KEY, "Content-Type": "application/json"},
                json={"coordinates": body.coordinates},
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"OpenRouteService respondió {response.status_code}",
            )
        data = response.json()
        feature = data["features"][0]
        coords = feature["geometry"]["coordinates"]
        props = feature.get("properties", {})
        summary = props.get("summary", {}) or {}
        segments = props.get("segments", []) or []
        return {
            "geometry": [[c[1], c[0]] for c in coords],
            "distance_m": summary.get("distance"),
            "duration_s": summary.get("duration"),
            "segments": [
                {
                    "distance_m": s.get("distance"),
                    "duration_s": s.get("duration"),
                }
                for s in segments
            ],
        }
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo contactar al servicio de ruteo: {exc}",
        )
    except (KeyError, IndexError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Respuesta inválida del servicio de ruteo: {exc}",
        )
