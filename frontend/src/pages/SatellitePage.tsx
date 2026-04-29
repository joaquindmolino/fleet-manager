import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { api } from '@/lib/api'
import { Link } from 'react-router-dom'
import { Settings, RefreshCw, Zap, ZapOff, Gauge } from 'lucide-react'

interface VehiclePosition {
  powerfleet_id: string
  name: string
  license_plate: string | null
  make: string | null
  model: string | null
  latitude: number | null
  longitude: number | null
  speed: number | null
  direction: number | null
  ignition_on: boolean | null
  odometer: number | null
  address: string | null
  last_update: string | null
  vehicle_id: string | null
}

// Íconos SVG inline para evitar el problema del path de Leaflet con Vite
function makeIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
    <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="white" stroke-width="2"/>
    <circle cx="14" cy="14" r="5" fill="white" opacity="0.9"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -36],
  })
}

const ICON_ON = makeIcon('#16a34a')     // verde — motor encendido
const ICON_IDLE = makeIcon('#f59e0b')   // naranja — encendido sin moverse
const ICON_OFF = makeIcon('#6b7280')    // gris — motor apagado

function vehicleIcon(pos: VehiclePosition) {
  if (!pos.ignition_on) return ICON_OFF
  if ((pos.speed ?? 0) > 2) return ICON_ON
  return ICON_IDLE
}

function formatOdometer(km: number | null) {
  if (km == null) return '—'
  return `${Math.round(km).toLocaleString('es-AR')} km`
}

function formatTime(ts: string | null) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ts
  }
}

// Componente que centra el mapa cuando llegan posiciones por primera vez
function AutoCenter({ positions }: { positions: VehiclePosition[] }) {
  const map = useMap()
  const centered = useRef(false)

  useEffect(() => {
    if (centered.current) return
    const valid = positions.filter(p => p.latitude != null && p.longitude != null)
    if (valid.length === 0) return
    if (valid.length === 1) {
      map.setView([valid[0].latitude!, valid[0].longitude!], 13)
    } else {
      const bounds = L.latLngBounds(valid.map(p => [p.latitude!, p.longitude!]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
    centered.current = true
  }, [positions, map])

  return null
}

export default function SatellitePage() {
  const { data: positions, isLoading, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['gps-positions'],
    queryFn: () => api.get<VehiclePosition[]>('/gps/positions').then(r => r.data),
    refetchInterval: 30_000,
    retry: false,
  })

  const notConfigured = isError && (error as { response?: { status?: number } })?.response?.status === 404
  const withCoords = (positions ?? []).filter(p => p.latitude != null && p.longitude != null)
  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Satelital</h1>
          {lastUpdate && (
            <p className="text-xs text-gray-400">Actualizado a las {lastUpdate} · próxima en 30s</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            Actualizar
          </button>
          <Link
            to="/gps-config"
            className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <Settings size={13} />
            Configurar GPS
          </Link>
        </div>
      </div>

      {/* Leyenda */}
      {!notConfigured && (
        <div className="px-5 py-2 bg-white border-b border-gray-100 flex items-center gap-5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> En movimiento
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> Detenido (motor on)
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-3 h-3 rounded-full bg-gray-500 inline-block" /> Motor apagado
          </div>
          {positions && (
            <span className="ml-auto text-xs text-gray-400">{withCoords.length} vehículo{withCoords.length !== 1 ? 's' : ''} en mapa</span>
          )}
        </div>
      )}

      {/* Mapa o estado */}
      <div className="flex-1 relative">
        {notConfigured ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Settings size={28} className="text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">GPS no configurado</p>
              <p className="text-sm text-gray-400 mt-1">Un administrador debe cargar las credenciales de PowerFleet</p>
            </div>
            <Link
              to="/gps-config"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              Ir a Configuración GPS
            </Link>
          </div>
        ) : isError ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-red-500">
              {(error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Error al obtener posiciones'}
            </p>
          </div>
        ) : (
          <MapContainer
            center={[-34.6, -58.4]}
            zoom={10}
            className="w-full h-full"
            zoomControl={true}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {withCoords.length > 0 && <AutoCenter positions={withCoords} />}
            {withCoords.map(pos => (
              <Marker
                key={pos.powerfleet_id}
                position={[pos.latitude!, pos.longitude!]}
                icon={vehicleIcon(pos)}
              >
                <Popup minWidth={220}>
                  <div className="py-1">
                    <p className="font-bold text-gray-900 text-sm mb-1">
                      {pos.license_plate ?? pos.name}
                    </p>
                    {(pos.make || pos.model) && (
                      <p className="text-xs text-gray-500 mb-2">{[pos.make, pos.model].filter(Boolean).join(' ')}</p>
                    )}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        {pos.ignition_on
                          ? <Zap size={13} className="text-green-600" />
                          : <ZapOff size={13} className="text-gray-400" />
                        }
                        <span className={pos.ignition_on ? 'text-green-700 font-medium' : 'text-gray-400'}>
                          Motor {pos.ignition_on ? 'encendido' : 'apagado'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Gauge size={13} className="text-blue-500" />
                        <span className="text-gray-700">{pos.speed != null ? `${Math.round(pos.speed)} km/h` : '— km/h'}</span>
                      </div>
                      {pos.odometer != null && (
                        <div className="text-xs text-gray-500">
                          Odómetro: <span className="font-medium text-gray-700">{formatOdometer(pos.odometer)}</span>
                        </div>
                      )}
                      {pos.address && (
                        <div className="text-xs text-gray-500 mt-1 leading-tight">{pos.address}</div>
                      )}
                      <div className="text-xs text-gray-400 pt-1 border-t border-gray-100">
                        Último dato: {formatTime(pos.last_update)}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </div>
  )
}
