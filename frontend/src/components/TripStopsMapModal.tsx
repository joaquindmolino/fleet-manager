import { useMemo } from 'react'
import { Map, Marker, GeoJson } from 'pigeon-maps'
import { X } from 'lucide-react'
import type { TripStop } from '@/types'

interface Props {
  stops: TripStop[]
  onClose: () => void
}

function NumberedPin({ n, isExtra }: { n: number; isExtra: boolean }) {
  const fill = isExtra ? '#f59e0b' : '#3b82f6'
  return (
    <svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" style={{ pointerEvents: 'none' }}>
      <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 23 15 23s15-12 15-23C30 6.7 23.3 0 15 0z" fill={fill} stroke="white" strokeWidth="2"/>
      <text x="15" y="20" fontFamily="Arial, sans-serif" fontSize="13" fontWeight="bold" fill="white" textAnchor="middle">{n}</text>
    </svg>
  )
}

function fitBounds(stops: TripStop[]): { center: [number, number]; zoom: number } {
  if (stops.length === 0) return { center: [-34.6, -58.4], zoom: 11 }
  if (stops.length === 1) return { center: [stops[0].lat, stops[0].lng], zoom: 15 }
  const lats = stops.map(s => s.lat)
  const lngs = stops.map(s => s.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const center: [number, number] = [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
  const maxDiff = Math.max(maxLat - minLat, maxLng - minLng) || 0.001
  // Estimación de zoom para que la extensión entre en la vista (aprox.)
  const zoom = Math.max(3, Math.min(17, Math.floor(Math.log2(360 / maxDiff)) - 1))
  return { center, zoom }
}

export default function TripStopsMapModal({ stops, onClose }: Props) {
  const ordered = useMemo(() => [...stops].sort((a, b) => a.timestamp.localeCompare(b.timestamp)), [stops])
  const { center, zoom } = useMemo(() => fitBounds(ordered), [ordered])

  // GeoJson LineString con las paradas en orden cronológico.
  // Mismo formato que devuelve OSRM (`routes[0].geometry`), así que cuando integremos
  // routing real solo cambia la fuente de las coordenadas.
  const route = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: ordered.length >= 2 ? [{
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        coordinates: ordered.map(s => [s.lng, s.lat] as [number, number]),
      },
      properties: {},
    }] : [],
  }), [ordered])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex flex-col">
      <div className="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-200 shrink-0">
        <div>
          <h2 className="font-semibold text-gray-900">Mapa de paradas</h2>
          <p className="text-xs text-gray-400">{ordered.length} entrega{ordered.length !== 1 ? 's' : ''} en orden cronológico</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 relative bg-white overflow-hidden">
        {ordered.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Este viaje no tiene entregas registradas.
          </div>
        ) : (
          <Map center={center} zoom={zoom} boxClassname="w-full h-full" attribution={false}>
            <GeoJson
              data={route}
              styleCallback={() => ({ stroke: '#3b82f6', strokeWidth: 3, fill: 'none', strokeOpacity: 0.7 })}
            />
            {ordered.map((s, i) => (
              <Marker key={s.id} anchor={[s.lat, s.lng]} width={30} offset={[15, 38]}>
                <NumberedPin n={i + 1} isExtra={s.is_extra} />
              </Marker>
            ))}
          </Map>
        )}
      </div>
    </div>
  )
}
