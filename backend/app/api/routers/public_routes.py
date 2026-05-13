"""Endpoints públicos (sin autenticación).

Por ahora solo se usa para servir la hoja de ruta de un viaje a partir de
un token UUID generado por el coordinador. El token es difícil de adivinar
y revocable (se puede regenerar) pero no expira.
"""

import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from sqlalchemy import select

from app.api.dependencies import DbSession
from app.models.driver import Driver
from app.models.trip import Trip, TripPlannedStop
from app.models.vehicle import Vehicle
from app.services.route_sheet_pdf import (
    RouteSheetData, RouteSheetStop, build_route_sheet_pdf,
)


router = APIRouter(prefix="/public", tags=["public"])


@router.get("/trips/share/{token}/route-sheet.pdf")
async def public_route_sheet(token: uuid.UUID, db: DbSession) -> Response:
    """Devuelve el PDF de hoja de ruta para un token público válido."""
    trip = (await db.execute(
        select(Trip).where(Trip.share_token == token)
    )).scalar_one_or_none()
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link inválido o revocado.")

    stops_result = (await db.execute(
        select(TripPlannedStop)
        .where(TripPlannedStop.trip_id == trip.id)
        .order_by(TripPlannedStop.sequence)
    )).scalars().all()

    driver_name: str | None = None
    if trip.driver_id:
        d = (await db.execute(select(Driver).where(Driver.id == trip.driver_id))).scalar_one_or_none()
        driver_name = d.full_name if d else None

    veh = (await db.execute(select(Vehicle).where(Vehicle.id == trip.vehicle_id))).scalar_one_or_none()
    plate = veh.plate if veh else None

    when = trip.scheduled_date or trip.created_at
    date_label = when.strftime("%d/%m/%Y") if when else ""

    total_service_min = sum((s.service_minutes or 0) for s in stops_result)
    if trip.name:
        display_name = trip.name
    elif date_label:
        display_name = f"Viaje del {date_label}"
    else:
        display_name = "Hoja de ruta"

    data = RouteSheetData(
        trip_name=display_name,
        associated_document=trip.associated_document,
        driver_name=driver_name,
        vehicle_plate=plate,
        date_label=date_label or "—",
        origin_address=trip.origin if (trip.origin and trip.origin != "Por definir") else None,
        origin_lat=trip.start_lat,
        origin_lng=trip.start_lng,
        stops=[
            RouteSheetStop(
                sequence=s.sequence,
                alias=s.alias,
                address=s.address,
                lat=s.lat,
                lng=s.lng,
                service_minutes=s.service_minutes,
                notes=s.notes,
                pin_color=s.pin_color,
                eta_minutes=None,
            )
            for s in stops_result
        ],
        total_km=None,
        total_drive_min=None,
        total_service_min=total_service_min,
    )

    pdf_bytes = build_route_sheet_pdf(data)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="hoja-de-ruta.pdf"'},
    )
