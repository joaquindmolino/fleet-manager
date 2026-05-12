import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import type { TripStop } from '@/types'

// Leaflet se carga desde CDN en index.html y expone `L` como global.
// Definimos un tipado minimo para no depender del paquete @types/leaflet.
interface LeafletMap {
  setView: (center: [number, number], zoom: number) => LeafletMap
  fitBounds: (bounds: unknown, options?: { padding?: [number, number] }) => LeafletMap
  remove: () => void
  invalidateSize: () => void
}
interface LeafletLayer { addTo: (m: LeafletMap) => LeafletLayer; remove: () => void }
interface LeafletStatic {
  map: (el: HTMLElement, opts?: object) => LeafletMap
  tileLayer: (url: string, opts?: object) => LeafletLayer
  marker: (latlng: [number, number], opts?: object) => LeafletLayer
  polyline: (points: [number, number][], opts?: object) => LeafletLayer
  divIcon: (opts: object) => unknown
  latLngBounds: (points: [number, number][]) => unknown
}
declare global {
  interface Window { L?: LeafletStatic }
}

interface Props {
  tripId: string
  stops: TripStop[]
  startLat?: number | null
  startLng?: number | null
  endLat?: number | null
  endLng?: number | null
  onClose: () => void
}

export default function TripStopsMapModal({
  tripId, stops, startLat, startLng, endLat, endLng, onClose,
}: Props) {
  const hasStart = startLat != null && startLng != null
  const hasEnd = endLat != null && endLng != null

  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const routeLayerRef = useRef<LeafletLayer | null>(null)
  const [routing, setRouting] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  const ordered = useMemo(
    () => [...stops].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [stops],
  )

  const hasAnyPoint = ordered.length > 0 || hasStart || hasEnd

  useEffect(() => {
    const L = window.L
    if (!L || !containerRef.current || !hasAnyPoint) return

    const map = L.map(containerRef.current, { scrollWheelZoom: true })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    // Secuencia completa de puntos: inicio → paradas → fin
    const pathPoints: [number, number][] = []
    if (hasStart) pathPoints.push([startLat as number, startLng as number])
    pathPoints.push(...ordered.map(s => [s.lat, s.lng] as [number, number]))
    if (hasEnd) pathPoints.push([endLat as number, endLng as number])

    // Polilínea provisoria con líneas rectas mientras se consulta OSRM.
    if (pathPoints.length >= 2) {
      routeLayerRef.current = L.polyline(pathPoints, {
        color: '#3b82f6', weight: 3, opacity: 0.4, dashArray: '6 6',
      }).addTo(map)
    }

    // Marker de inicio (verde con bandera)
    if (hasStart) {
      L.marker([startLat as number, startLng as number], {
        icon: L.divIcon({
          className: '',
          iconSize: [32, 40],
          iconAnchor: [16, 40],
          html: `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.2 0 0 7.2 0 16c0 11.7 16 24 16 24s16-12.3 16-24C32 7.2 24.8 0 16 0z"
              fill="#16a34a" stroke="white" stroke-width="2"/>
            <path d="M11 9 L11 22 M11 9 L21 11 L18 14 L21 17 L11 15" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`,
        }),
      }).addTo(map)
    }

    // Markers numerados de paradas
    ordered.forEach((s, i) => {
      const fill = s.is_extra ? '#f59e0b' : '#3b82f6'
      const icon = L.divIcon({
        className: '',
        iconSize: [30, 38],
        iconAnchor: [15, 38],
        html: `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 23 15 23s15-12 15-23C30 6.7 23.3 0 15 0z"
            fill="${fill}" stroke="white" stroke-width="2"/>
          <text x="15" y="20" font-family="Arial, sans-serif" font-size="13" font-weight="bold"
            fill="white" text-anchor="middle">${i + 1}</text>
        </svg>`,
      })
      L.marker([s.lat, s.lng], { icon }).addTo(map)
    })

    // Marker de fin (rojo con check)
    if (hasEnd) {
      L.marker([endLat as number, endLng as number], {
        icon: L.divIcon({
          className: '',
          iconSize: [32, 40],
          iconAnchor: [16, 40],
          html: `<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 0C7.2 0 0 7.2 0 16c0 11.7 16 24 16 24s16-12.3 16-24C32 7.2 24.8 0 16 0z"
              fill="#dc2626" stroke="white" stroke-width="2"/>
            <path d="M10 17 L14 21 L22 12" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`,
        }),
      }).addTo(map)
    }

    if (pathPoints.length === 1) {
      map.setView(pathPoints[0], 15)
    } else if (pathPoints.length >= 2) {
      map.fitBounds(L.latLngBounds(pathPoints), { padding: [40, 40] })
    }

    setTimeout(() => map.invalidateSize(), 0)

    // Pedir la ruta real al backend (que la consulta a OpenRouteService) y
    // reemplazar la polilínea provisoria con la geometría vehicular real.
    let cancelled = false
    if (pathPoints.length >= 2) {
      setRouting(true)
      setRouteError(null)
      api.get<{ geometry: [number, number][] }>(`/trips/${tripId}/route`)
        .then(res => {
          if (cancelled || res.data.geometry.length < 2) return
          routeLayerRef.current?.remove()
          routeLayerRef.current = L.polyline(res.data.geometry, {
            color: '#3b82f6', weight: 4, opacity: 0.85,
          }).addTo(map)
        })
        .catch((err: { response?: { data?: { detail?: string } }; message?: string }) => {
          if (cancelled) return
          const detail = err?.response?.data?.detail ?? err?.message ?? 'error desconocido'
          setRouteError(`No se pudo calcular la ruta vehicular (${detail}). Se muestra la línea recta entre paradas.`)
        })
        .finally(() => { if (!cancelled) setRouting(false) })
    }

    return () => {
      cancelled = true
      map.remove()
      mapRef.current = null
      routeLayerRef.current = null
    }
  }, [ordered, tripId, hasStart, hasEnd, startLat, startLng, endLat, endLng, hasAnyPoint])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200 shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">Mapa del viaje</h2>
          <p className="text-xs text-gray-400">
            {hasStart && <span className="inline-flex items-center gap-1 mr-2"><span className="w-2 h-2 rounded-full bg-green-600 inline-block" />Inicio</span>}
            {ordered.length > 0 && <span className="mr-2">{ordered.length} entrega{ordered.length !== 1 ? 's' : ''}</span>}
            {hasEnd && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-600 inline-block" />Fin</span>}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 relative bg-white overflow-hidden">
        {!hasAnyPoint ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Este viaje no tiene ubicaciones registradas.
          </div>
        ) : (
          <>
            <div ref={containerRef} className="absolute inset-0" />
            {routing && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[400] bg-white shadow-md rounded-full px-3 py-1.5 flex items-center gap-2 text-xs text-gray-600 border border-gray-200">
                <Loader2 size={13} className="animate-spin text-blue-500" />
                Calculando ruta vehicular...
              </div>
            )}
            {routeError && (
              <div className="absolute top-3 left-3 right-3 z-[400] bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2 shadow-md">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">{routeError}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
