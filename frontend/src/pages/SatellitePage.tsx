import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Map, Marker, Overlay } from 'pigeon-maps'
import { api } from '@/lib/api'
import { Link } from 'react-router-dom'
import { Settings, RefreshCw, Zap, ZapOff, Gauge, X } from 'lucide-react'

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

function markerColor(pos: VehiclePosition): string {
  if (!pos.ignition_on) return '#6b7280'       // gris — motor apagado
  if ((pos.speed ?? 0) > 2) return '#16a34a'   // verde — en movimiento
  return '#f59e0b'                              // naranja — detenido con motor on
}

function MarkerPin({ color }: { color: string }) {
  return (
    <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z"
        fill={color} stroke="white" strokeWidth="2" />
      <circle cx="14" cy="14" r="5" fill="white" opacity="0.9" />
    </svg>
  )
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

function mapCenter(positions: VehiclePosition[]): [number, number] {
  const valid = positions.filter(p => p.latitude != null && p.longitude != null)
  if (valid.length === 0) return [-34.6, -58.4]
  const lat = valid.reduce((s, p) => s + p.latitude!, 0) / valid.length
  const lng = valid.reduce((s, p) => s + p.longitude!, 0) / valid.length
  return [lat, lng]
}

export default function SatellitePage() {
  const [selected, setSelected] = useState<VehiclePosition | null>(null)

  const { data: positions, isLoading, isError, error, dataUpdatedAt, refetch } = useQuery({
    queryKey: ['gps-positions'],
    queryFn: () => api.get<VehiclePosition[]>('/gps/positions').then(r => r.data),
    refetchInterval: 30_000,
    retry: false,
  })

  const notConfigured = isError && (error as { response?: { status?: number } })?.response?.status === 404
  const withCoords = (positions ?? []).filter(p => p.latitude != null && p.longitude != null)
  const center = mapCenter(withCoords)
  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="px-5 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Satelital</h1>
          {lastUpdate && (
            <p className="text-xs text-gray-400">Actualizado {lastUpdate} · próxima actualización en 30s</p>
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
        <div className="px-5 py-2 bg-white border-b border-gray-100 flex flex-wrap items-center gap-5 shrink-0">
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
            <span className="ml-auto text-xs text-gray-400">
              {withCoords.length} vehículo{withCoords.length !== 1 ? 's' : ''} en mapa
            </span>
          )}
        </div>
      )}

      {/* Contenido principal */}
      <div className="flex-1 relative overflow-hidden">

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
          <Map
            center={center}
            zoom={withCoords.length > 0 ? 11 : 10}
            boxClassname="w-full h-full"
            attribution={false}
          >
            {withCoords.map(pos => (
              <Marker
                key={pos.powerfleet_id}
                anchor={[pos.latitude!, pos.longitude!]}
                width={28}
                onClick={() => setSelected(s => s?.powerfleet_id === pos.powerfleet_id ? null : pos)}
              >
                <MarkerPin color={markerColor(pos)} />
              </Marker>
            ))}

            {/* Popup del vehículo seleccionado */}
            {selected && selected.latitude != null && selected.longitude != null && (
              <Overlay anchor={[selected.latitude, selected.longitude]} offset={[14, 36]}>
                <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-56 relative">
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-2 right-2 text-gray-400 hover:text-gray-600 p-0.5"
                  >
                    <X size={14} />
                  </button>
                  <p className="font-bold text-gray-900 text-sm pr-4">
                    {selected.license_plate ?? selected.name}
                  </p>
                  {(selected.make || selected.model) && (
                    <p className="text-xs text-gray-400 mb-2">
                      {[selected.make, selected.model].filter(Boolean).join(' ')}
                    </p>
                  )}
                  <div className="space-y-1.5 mt-2">
                    <div className="flex items-center gap-2 text-xs">
                      {selected.ignition_on
                        ? <Zap size={13} className="text-green-600" />
                        : <ZapOff size={13} className="text-gray-400" />
                      }
                      <span className={selected.ignition_on ? 'text-green-700 font-medium' : 'text-gray-400'}>
                        Motor {selected.ignition_on ? 'encendido' : 'apagado'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Gauge size={13} className="text-blue-500" />
                      <span className="text-gray-700">
                        {selected.speed != null ? `${Math.round(selected.speed)} km/h` : '— km/h'}
                      </span>
                    </div>
                    {selected.odometer != null && (
                      <div className="text-xs text-gray-500">
                        Odómetro: <span className="font-medium text-gray-700">{formatOdometer(selected.odometer)}</span>
                      </div>
                    )}
                    {selected.address && (
                      <div className="text-xs text-gray-400 leading-tight">{selected.address}</div>
                    )}
                    <div className="text-xs text-gray-400 pt-1.5 border-t border-gray-100">
                      Último dato: {formatTime(selected.last_update)}
                    </div>
                  </div>
                </div>
              </Overlay>
            )}
          </Map>
        )}
      </div>
    </div>
  )
}
