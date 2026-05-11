import { useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import type { TripStop } from '@/types'

// Leaflet se carga desde CDN en index.html y expone `L` como global.
// Definimos un tipado minimo para no depender del paquete @types/leaflet.
interface LeafletMap {
  setView: (center: [number, number], zoom: number) => LeafletMap
  fitBounds: (bounds: unknown, options?: { padding?: [number, number] }) => LeafletMap
  remove: () => void
  invalidateSize: () => void
}
interface LeafletStatic {
  map: (el: HTMLElement, opts?: object) => LeafletMap
  tileLayer: (url: string, opts?: object) => { addTo: (m: LeafletMap) => unknown }
  marker: (latlng: [number, number], opts?: object) => { addTo: (m: LeafletMap) => unknown }
  polyline: (points: [number, number][], opts?: object) => { addTo: (m: LeafletMap) => unknown }
  divIcon: (opts: object) => unknown
  latLngBounds: (points: [number, number][]) => unknown
}
declare global {
  interface Window { L?: LeafletStatic }
}

interface Props {
  stops: TripStop[]
  onClose: () => void
}

export default function TripStopsMapModal({ stops, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  const ordered = useMemo(
    () => [...stops].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [stops],
  )

  useEffect(() => {
    const L = window.L
    if (!L || !containerRef.current || ordered.length === 0) return

    const map = L.map(containerRef.current, { scrollWheelZoom: true })
    mapRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    // Polilínea cronológica entre paradas. Cuando integremos OSRM, este array
    // será reemplazado por la geometría devuelta por el servicio de routing.
    if (ordered.length >= 2) {
      L.polyline(
        ordered.map(s => [s.lat, s.lng] as [number, number]),
        { color: '#3b82f6', weight: 3, opacity: 0.7 },
      ).addTo(map)
    }

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

    if (ordered.length === 1) {
      map.setView([ordered[0].lat, ordered[0].lng], 15)
    } else {
      map.fitBounds(
        L.latLngBounds(ordered.map(s => [s.lat, s.lng] as [number, number])),
        { padding: [40, 40] },
      )
    }

    // Forzar recálculo de tamaño después del mount (a veces el contenedor mide 0 al inicio)
    setTimeout(() => map.invalidateSize(), 0)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [ordered])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200 shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">Mapa de paradas</h2>
          <p className="text-xs text-gray-400">
            {ordered.length} entrega{ordered.length !== 1 ? 's' : ''} en orden cronológico
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
        {ordered.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Este viaje no tiene entregas registradas.
          </div>
        ) : (
          <div ref={containerRef} className="absolute inset-0" />
        )}
      </div>
    </div>
  )
}
