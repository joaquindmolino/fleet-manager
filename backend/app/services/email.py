"""Servicio de envío de emails via Resend API."""

from __future__ import annotations

import httpx
from app.core.config import settings

_RESEND_URL = "https://api.resend.com/emails"


def send_email(to: str | list[str], subject: str, html: str) -> bool:
    """Envía un email via Resend. No-op si RESEND_API_KEY no está configurado."""
    if not settings.RESEND_API_KEY:
        return False
    recipients = [to] if isinstance(to, str) else to
    try:
        with httpx.Client(timeout=10) as client:
            res = client.post(
                _RESEND_URL,
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={"from": settings.EMAIL_FROM, "to": recipients, "subject": subject, "html": html},
            )
            return res.status_code in (200, 201)
    except Exception:
        return False


# ─── Template base ────────────────────────────────────────────────────────────

def _base(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>{title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr><td style="background:#2563eb;padding:20px 32px">
          <p style="margin:0;color:#fff;font-size:18px;font-weight:700;letter-spacing:-.3px">Fleet Manager</p>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="margin:0 0 20px;color:#111827;font-size:20px;font-weight:700">{title}</h1>
          {body_html}
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
          <p style="margin:0;color:#9ca3af;font-size:12px">Fleet Manager · Sistema de gestión de flotas</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>"""


def _row(label: str, value: str) -> str:
    return f'<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;width:40%">{label}</td><td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600">{value}</td></tr>'


def _btn(text: str, url: str) -> str:
    return f'<a href="{url}" style="display:inline-block;margin-top:24px;background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">{text} →</a>'


# ─── Templates por evento ─────────────────────────────────────────────────────

def build_trip_assigned_driver_email(
    driver_name: str, document: str, stops_count: int | None,
    vehicle_plate: str, date_str: str, frontend_url: str,
) -> tuple[str, str]:
    subject = f"Reparto asignado — {document}"
    stops = str(stops_count) if stops_count else "Sin definir"
    body = f"""
    <p style="color:#374151;margin:0 0 20px">Hola <strong>{driver_name}</strong>, tenés un nuevo reparto asignado.</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb">
      {_row("Documento", document)}
      {_row("Fecha", date_str)}
      {_row("Paradas", stops)}
      {_row("Vehículo", vehicle_plate)}
    </table>
    {_btn("Ver reparto", frontend_url + "/delivery")}"""
    return subject, _base(f"Reparto asignado: {document}", body)


def build_trip_assigned_coordinator_email(
    driver_name: str, document: str, stops_count: int | None,
    vehicle_plate: str, date_str: str, frontend_url: str,
) -> tuple[str, str]:
    subject = f"Nuevo reparto — {driver_name}"
    stops = str(stops_count) if stops_count else "Sin definir"
    body = f"""
    <p style="color:#374151;margin:0 0 20px">Se asignó un nuevo reparto a <strong>{driver_name}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb">
      {_row("Documento", document)}
      {_row("Fecha", date_str)}
      {_row("Paradas", stops)}
      {_row("Vehículo", vehicle_plate)}
    </table>
    {_btn("Ver viajes", frontend_url + "/trips")}"""
    return subject, _base(f"Nuevo reparto — {driver_name}", body)


def build_trip_started_email(
    driver_name: str, document: str, started_at: str, frontend_url: str,
) -> tuple[str, str]:
    subject = f"Reparto iniciado — {driver_name}"
    body = f"""
    <p style="color:#374151;margin:0 0 20px"><strong>{driver_name}</strong> inició el reparto <strong>{document}</strong> a las {started_at}.</p>
    {_btn("Ver viajes", frontend_url + "/trips")}"""
    return subject, _base(f"Reparto iniciado — {driver_name}", body)


def build_trip_completed_email(
    driver_name: str, document: str, km_driven: int | None, frontend_url: str,
) -> tuple[str, str]:
    subject = f"Reparto completado — {driver_name}"
    km_text = f"<p style='color:#374151;margin:8px 0 0'><strong>{km_driven} km</strong> recorridos.</p>" if km_driven else ""
    body = f"""
    <p style="color:#374151;margin:0 0 8px"><strong>{driver_name}</strong> completó el reparto <strong>{document}</strong>.</p>
    {km_text}
    {_btn("Ver detalle", frontend_url + "/trips")}"""
    return subject, _base(f"Reparto completado — {driver_name}", body)


def build_daily_summary_email(
    tenant_name: str, completed: int, in_progress: int, pending: int,
    trip_rows: list[dict], frontend_url: str,
) -> tuple[str, str]:
    subject = f"Resumen de viajes del día — {tenant_name}"

    status_labels = {"completado": "Completado", "en_curso": "En curso", "pendiente": "Pendiente", "cancelado": "Cancelado", "planificado": "Planificado"}
    rows_html = "".join(
        f'<tr style="border-bottom:1px solid #f3f4f6">'
        f'<td style="padding:8px 4px;font-size:13px;color:#111827">{r["doc"]}</td>'
        f'<td style="padding:8px 4px;font-size:13px;color:#374151">{r["driver"]}</td>'
        f'<td style="padding:8px 4px;font-size:13px;color:#374151">{status_labels.get(r["status"], r["status"])}</td>'
        f'<td style="padding:8px 4px;font-size:13px;color:#374151;text-align:right">{str(r["km"]) + " km" if r["km"] else "—"}</td>'
        f'</tr>'
        for r in trip_rows
    )

    body = f"""
    <p style="color:#374151;margin:0 0 20px">Resumen de actividad del día para <strong>{tenant_name}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="text-align:center;padding:16px;background:#f0fdf4;border-radius:8px;width:33%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#16a34a">{completed}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Completados</p>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:16px;background:#eff6ff;border-radius:8px;width:33%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#2563eb">{in_progress}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280">En curso</p>
        </td>
        <td style="width:8px"></td>
        <td style="text-align:center;padding:16px;background:#fafafa;border-radius:8px;width:33%">
          <p style="margin:0;font-size:28px;font-weight:700;color:#6b7280">{pending}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Pendientes</p>
        </td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;border-top:2px solid #e5e7eb">
      <tr style="background:#f9fafb">
        <th style="padding:8px 4px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Documento</th>
        <th style="padding:8px 4px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Chofer</th>
        <th style="padding:8px 4px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Estado</th>
        <th style="padding:8px 4px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">Km</th>
      </tr>
      {rows_html}
    </table>
    {_btn("Ver todos los viajes", frontend_url + "/trips")}"""
    return subject, _base("Resumen de viajes del día", body)


def build_maintenance_alerts_email(
    tenant_name: str, alerts: list[dict], frontend_url: str,
) -> tuple[str, str]:
    subject = f"⚠️ {len(alerts)} alerta{'s' if len(alerts) > 1 else ''} de mantenimiento — {tenant_name}"

    rows_html = "".join(
        f'<tr style="border-bottom:1px solid #f3f4f6">'
        f'<td style="padding:10px 4px">'
        f'  <p style="margin:0;font-size:13px;font-weight:600;color:#{"dc2626" if a["severity"]=="danger" else "d97706"}">{a["type"]}</p>'
        f'  <p style="margin:2px 0 0;font-size:13px;color:#374151">{a["entity"]}</p>'
        f'</td>'
        f'<td style="padding:10px 4px;font-size:13px;color:#6b7280;text-align:right">{a["detail"]}</td>'
        f'</tr>'
        for a in alerts
    )

    body = f"""
    <p style="color:#374151;margin:0 0 20px">Hay <strong>{len(alerts)} alerta{'s' if len(alerts) > 1 else ''}</strong> pendiente{'s' if len(alerts) > 1 else ''} en <strong>{tenant_name}</strong>.</p>
    <table style="width:100%;border-collapse:collapse;border-top:2px solid #e5e7eb">
      {rows_html}
    </table>
    {_btn("Ver mantenimiento", frontend_url + "/maintenance")}"""
    return subject, _base(f"Alertas de mantenimiento", body)
