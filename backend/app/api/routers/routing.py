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


@router.get("/autocomplete", response_model=list[AutocompleteSuggestion])
async def autocomplete(
    current_user: CurrentUser,
    q: str = Query(..., min_length=2, max_length=200),
    country: str = Query("ar", min_length=2, max_length=3),
) -> list[AutocompleteSuggestion]:
    """Sugerencias de direcciones via Nominatim (OpenStreetMap).

    Nominatim tiene mejor cobertura de alturas en Argentina que ORS Pelias.
    Es gratis, sin API key, pero rate-limited a ~1 req/segundo y pide un
    User-Agent identificable. El frontend ya debouncea las consultas.
    """
    _ = current_user  # gatear el endpoint con auth
    params: dict = {
        "q": q,
        "format": "jsonv2",
        "limit": 10,
        "addressdetails": 0,
    }
    if country:
        params["countrycodes"] = country.lower()
    headers = {
        # Nominatim Usage Policy: identificar la app con User-Agent + contacto.
        "User-Agent": "FleetManager/0.1 (contact: support@fleetmanager.app)",
        "Accept-Language": "es",
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params=params,
                headers=headers,
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Geocoding respondió {response.status_code}",
            )
        data = response.json()
        suggestions: list[AutocompleteSuggestion] = []
        for item in data:
            label = item.get("display_name")
            try:
                lat = float(item["lat"])
                lng = float(item["lon"])
            except (KeyError, ValueError, TypeError):
                continue
            if label:
                suggestions.append(AutocompleteSuggestion(label=label, lat=lat, lng=lng))
        return suggestions
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
