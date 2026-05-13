"""Generación del PDF 'hoja de ruta' que el chofer imprime.

Cada parada incluye un QR que, al escanearse, abre Google Maps en modo
'cómo llegar' desde la ubicación actual del chofer hasta el destino.
"""

import io
from dataclasses import dataclass
from datetime import datetime
from urllib.parse import quote_plus

import qrcode
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, KeepTogether, PageBreak,
)


GOOGLE_MAPS_DIR_URL = "https://www.google.com/maps/dir/?api=1&destination={lat},{lng}"


@dataclass
class RouteSheetStop:
    sequence: int
    alias: str | None
    address: str
    lat: float
    lng: float
    service_minutes: int
    notes: str | None
    pin_color: str | None
    eta_minutes: int | None  # acumulado desde el inicio


@dataclass
class RouteSheetData:
    trip_name: str
    associated_document: str | None
    driver_name: str | None
    vehicle_plate: str | None
    date_label: str
    origin_address: str | None
    origin_lat: float | None
    origin_lng: float | None
    stops: list[RouteSheetStop]
    total_km: float | None
    total_drive_min: int | None
    total_service_min: int


def _qr_image(url: str) -> ImageReader:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return ImageReader(buf)


def _color_swatch(hex_color: str | None) -> str:
    PALETTE = {
        "gray": "#6b7280",
        "red": "#dc2626",
        "orange": "#f97316",
        "yellow": "#eab308",
        "green": "#16a34a",
        "blue": "#2563eb",
        "purple": "#9333ea",
        "pink": "#ec4899",
    }
    return PALETTE.get(hex_color or "gray", "#6b7280")


def build_route_sheet_pdf(data: RouteSheetData) -> bytes:
    """Devuelve los bytes del PDF de la hoja de ruta."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
        title=f"Hoja de ruta - {data.trip_name}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"], fontSize=20, leading=24, alignment=0, spaceAfter=2,
    )
    sub_style = ParagraphStyle(
        "Sub", parent=styles["Normal"], fontSize=10, textColor=HexColor("#6b7280"),
    )
    label_style = ParagraphStyle(
        "Label", parent=styles["Normal"], fontSize=8, textColor=HexColor("#6b7280"),
        leading=10, alignment=0,
    )
    stop_alias_style = ParagraphStyle(
        "StopAlias", parent=styles["Normal"], fontSize=12, leading=14,
        textColor=HexColor("#111827"),
    )
    stop_addr_style = ParagraphStyle(
        "StopAddr", parent=styles["Normal"], fontSize=9, leading=11,
        textColor=HexColor("#374151"),
    )
    notes_style = ParagraphStyle(
        "Notes", parent=styles["Normal"], fontSize=10, leading=13,
        textColor=HexColor("#111827"), backColor=HexColor("#fef3c7"),
        borderPadding=4, leftIndent=4, rightIndent=4,
    )
    eta_style = ParagraphStyle(
        "Eta", parent=styles["Normal"], fontSize=9, leading=11,
        textColor=HexColor("#2563eb"), alignment=0,
    )

    elements: list = []

    # Header
    elements.append(Paragraph(_html_escape(data.trip_name), title_style))
    header_bits: list[str] = []
    if data.associated_document:
        header_bits.append(f"<b>Documento:</b> {_html_escape(data.associated_document)}")
    if data.driver_name:
        header_bits.append(f"<b>Chofer:</b> {_html_escape(data.driver_name)}")
    if data.vehicle_plate:
        header_bits.append(f"<b>Vehículo:</b> {_html_escape(data.vehicle_plate)}")
    header_bits.append(f"<b>Fecha:</b> {_html_escape(data.date_label)}")
    elements.append(Paragraph(" &nbsp;·&nbsp; ".join(header_bits), sub_style))

    # Summary
    summary_parts: list[str] = []
    if data.total_km is not None:
        summary_parts.append(f"{data.total_km:.1f} km")
    if data.total_drive_min is not None:
        summary_parts.append(f"{data.total_drive_min} min en ruta")
    summary_parts.append(f"{data.total_service_min} min en paradas")
    if data.total_drive_min is not None:
        summary_parts.append(f"<b>{data.total_drive_min + data.total_service_min} min total</b>")
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(" · ".join(summary_parts), sub_style))
    elements.append(Spacer(1, 12))

    # Inicio del viaje (si existe)
    if data.origin_address and data.origin_lat is not None and data.origin_lng is not None:
        elements.append(_build_stop_block(
            number_text="S",
            number_color="#16a34a",
            alias="Inicio del viaje",
            address=data.origin_address,
            notes=None,
            eta_text=None,
            service_min=None,
            lat=data.origin_lat,
            lng=data.origin_lng,
            stop_alias_style=stop_alias_style,
            stop_addr_style=stop_addr_style,
            notes_style=notes_style,
            eta_style=eta_style,
            label_style=label_style,
        ))
        elements.append(Spacer(1, 8))

    # Paradas
    for s in data.stops:
        eta_text = None
        if s.eta_minutes is not None:
            eta_text = f"ETA acumulada: {s.eta_minutes} min desde el inicio"
        elements.append(_build_stop_block(
            number_text=str(s.sequence + 1),
            number_color=_color_swatch(s.pin_color),
            alias=s.alias,
            address=s.address,
            notes=s.notes,
            eta_text=eta_text,
            service_min=s.service_minutes,
            lat=s.lat,
            lng=s.lng,
            stop_alias_style=stop_alias_style,
            stop_addr_style=stop_addr_style,
            notes_style=notes_style,
            eta_style=eta_style,
            label_style=label_style,
        ))
        elements.append(Spacer(1, 8))

    # Footer
    elements.append(Spacer(1, 12))
    footer = ParagraphStyle(
        "Footer", parent=styles["Normal"], fontSize=7,
        textColor=HexColor("#9ca3af"), alignment=1,
    )
    elements.append(Paragraph(
        f"Generado el {datetime.now().strftime('%d/%m/%Y %H:%M')} · "
        "Escaneá el QR de cada parada para navegar con Google Maps",
        footer,
    ))

    doc.build(buf_elements_with_page_numbers(elements))
    return buf.getvalue()


def buf_elements_with_page_numbers(elements: list) -> list:
    """Pasa-through. Hook para futura paginación si se necesita."""
    return elements


def _build_stop_block(
    *,
    number_text: str,
    number_color: str,
    alias: str | None,
    address: str,
    notes: str | None,
    eta_text: str | None,
    service_min: int | None,
    lat: float,
    lng: float,
    stop_alias_style: ParagraphStyle,
    stop_addr_style: ParagraphStyle,
    notes_style: ParagraphStyle,
    eta_style: ParagraphStyle,
    label_style: ParagraphStyle,
) -> KeepTogether:
    """Genera un bloque (tabla) para una parada con QR a la derecha.

    Layout:
      [N°] [alias + dirección + ETA + observaciones]                  [QR]
    """
    qr_url = GOOGLE_MAPS_DIR_URL.format(lat=lat, lng=lng)
    qr = _qr_image(qr_url)

    # Columna central: alias, dirección, observaciones, ETA
    middle_flowables: list = []
    if alias:
        middle_flowables.append(Paragraph(f"<b>{_html_escape(alias)}</b>", stop_alias_style))
    middle_flowables.append(Paragraph(_html_escape(address), stop_addr_style))
    info_bits: list[str] = []
    if eta_text:
        info_bits.append(eta_text)
    if service_min is not None:
        info_bits.append(f"Servicio: {service_min} min")
    if info_bits:
        middle_flowables.append(Spacer(1, 2))
        middle_flowables.append(Paragraph(" · ".join(info_bits), eta_style))
    if notes:
        middle_flowables.append(Spacer(1, 4))
        middle_flowables.append(Paragraph(
            f"<b>Observaciones:</b> {_html_escape(notes)}", notes_style,
        ))

    # Número de parada como circulo (placeholder: lo dibujamos via Table style)
    number_cell = Paragraph(
        f'<font color="white" size="14"><b>{_html_escape(number_text)}</b></font>',
        ParagraphStyle("num", alignment=1),
    )

    table = Table(
        [[number_cell, middle_flowables, qr]],
        colWidths=[1.4 * cm, None, 2.8 * cm],
        rowHeights=[2.8 * cm],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), HexColor(number_color)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("ALIGN", (2, 0), (2, 0), "RIGHT"),
        ("LEFTPADDING", (1, 0), (1, 0), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 8),
        ("TOPPADDING", (1, 0), (1, 0), 6),
        ("BOTTOMPADDING", (1, 0), (1, 0), 6),
        ("BOX", (0, 0), (-1, -1), 0.5, HexColor("#e5e7eb")),
    ]))
    return KeepTogether([table])


def _html_escape(s: str) -> str:
    return (
        s.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )
