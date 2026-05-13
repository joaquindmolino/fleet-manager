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
    country: str = Query("AR", min_length=2, max_length=3),
) -> list[AutocompleteSuggestion]:
    """Sugerencias de direcciones (proxy a ORS Pelias /geocode/search).

    Usamos /geocode/search en lugar de /geocode/autocomplete porque el segundo
    es muy restrictivo con queries parciales y matcheo de palabras intermedias.
    """
    _ = current_user  # gatear el endpoint con auth
    if not settings.ORS_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Servicio de geocoding no configurado.",
        )
    params: dict = {
        "api_key": settings.ORS_API_KEY,
        "text": q,
        "size": 10,
    }
    if country:
        params["boundary.country"] = country
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                "https://api.openrouteservice.org/geocode/search",
                params=params,
            )
        if response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Geocoding respondió {response.status_code}: {response.text[:200]}",
            )
        data = response.json()
        suggestions: list[AutocompleteSuggestion] = []
        for feat in data.get("features", []):
            label = feat.get("properties", {}).get("label")
            coords = feat.get("geometry", {}).get("coordinates")
            if label and isinstance(coords, list) and len(coords) >= 2:
                suggestions.append(AutocompleteSuggestion(label=label, lat=coords[1], lng=coords[0]))
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
        summary = feature.get("properties", {}).get("summary", {}) or {}
        return {
            "geometry": [[c[1], c[0]] for c in coords],
            "distance_m": summary.get("distance"),
            "duration_s": summary.get("duration"),
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
