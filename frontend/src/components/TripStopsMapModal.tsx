import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { X } from 'lucide-react'
import type { TripStop } from '@/types'

interface Props {
  stops: TripStop[]
  onClose: () => void
}

function numberedIcon(n: number, isExtra: boolean): L.DivIcon {
  const fill = isExtra ? '#f59e0b' : '#3b82f6'
  const html = `
    <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 23 15 23s15-12 15-23C30 6.7 23.3 0 15 0z"
        fill="${fill}" stroke="white" stroke-width="2"/>
      <text x="15" y="20" font-family="Arial, sans-serif" font-size="13" font-weight="bold"
        fill="white" text-anchor="middle">${n}</text>
    </svg>
  `
  return L.divIcon({
    html,
    className: '',
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -38],
  })
}

function FitBounds({ stops }: { stops: TripStop[] }) {
  const map = useMap()
  useEffect(() => {
    if (stops.length === 0) return
    if (stops.length === 1) {
      map.setView([stops[0].lat, stops[0].lng], 15)
      return
    }
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [stops, map])
  return null
}

export default function TripStopsMapModal({ stops, onClose }: Props) {
  const ordered = useMemo(
    () => [...stops].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [stops],
  )
  // Polilínea en orden cronológico. Cuando integremos OSRM, este array será reemplazado
  // por la geometría devuelta por el servicio de routing (mismo formato lat/lng).
  const polylinePoints = useMemo(
    () => ordered.map(s => [s.lat, s.lng] as [number, number]),
    [ordered],
  )

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
          <MapContainer
            center={[ordered[0].lat, ordered[0].lng]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {polylinePoints.length >= 2 && (
              <Polyline
                positions={polylinePoints}
                pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.7 }}
              />
            )}
            {ordered.map((s, i) => (
              <Marker
                key={s.id}
                position={[s.lat, s.lng]}
                icon={numberedIcon(i + 1, s.is_extra)}
              />
            ))}
            <FitBounds stops={ordered} />
          </MapContainer>
        )}
      </div>
    </div>
  )
}
