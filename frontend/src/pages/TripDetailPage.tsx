import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Truck, User, Package, Gauge, Clock, FileText,
  Edit2, Play, X, Loader2, AlertTriangle, MapPin, Map as MapIcon,
} from 'lucide-react'
import { api } from '@/lib/api'
import { captureLocation } from '@/lib/geolocation'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import TripStopsMapModal from '@/components/TripStopsMapModal'
import type { Trip, TripStop, Vehicle, Driver, Client, PaginatedResponse } from '@/types'

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', planificado: 'Planificado',
  en_curso: 'En curso', completado: 'Completado', cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  planificado: 'bg-gray-100 text-gray-600',
  en_curso: 'bg-blue-100 text-blue-700',
  completado: 'bg-green-100 text-green-700',
  cancelado: 'bg-gray-100 text-gray-400',
}

const CI = 'border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
const CS = CI + ' bg-white'

interface EF {
  associated_document: string
  origin: string
  destination: string
  notes: string
  stops_count: string
  start_odometer: string
  client_id: string
}

function formatDT(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h} h`
  return `${h} h ${m} min`
}

function formatKm(meters: number | null): string {
  if (meters == null) return '—'
  return `${(meters / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`
}

function Row({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Icon size={16} className="text-gray-400 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canSeeClients = can('clientes', 'ver')
  const canEdit = can('viajes', 'editar')
  const canSeeVehicles = can('vehiculos', 'ver')
  const canSeeDrivers = can('conductores', 'ver')

  const [editing, setEditing] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [editForm, setEditForm] = useState<EF>({
    associated_document: '', origin: '', destination: '',
    notes: '', stops_count: '', start_odometer: '', client_id: '',
  })

  const { data: trip, isLoading } = useQuery({
    queryKey: ['trip', id],
    queryFn: () => api.get<Trip>(`/trips/${id}`).then(r => r.data),
    enabled: !!id,
  })

  const { data: stops } = useQuery({
    queryKey: ['trip-stops', id],
    queryFn: () => api.get<TripStop[]>(`/trips/${id}/stops`).then(r => r.data),
    enabled: !!id && !!trip && trip.status !== 'pendiente' && trip.status !== 'planificado',
  })

  // Solo pedimos la ruta vehicular cuando el viaje terminó (para el panel de resumen).
  // Si está en curso o sin ubicaciones, el dato cambia y no vale la pena cachear.
  const hasAnyLocation = !!trip && (trip.start_lat != null || trip.end_lat != null || (stops && stops.length > 0))
  const { data: routeSummary } = useQuery({
    queryKey: ['trip-route', id],
    queryFn: () => api.get<{ geometry: [number, number][]; distance_m: number | null; duration_s: number | null }>(`/trips/${id}/route`).then(r => r.data),
    enabled: !!id && !!trip && trip.status === 'completado' && !!hasAnyLocation,
    retry: false,
    staleTime: 60 * 60 * 1000,
  })

  const { data: vehicles } = useList<Vehicle>('vehicles', '/vehicles', 100, canSeeVehicles)
  const { data: drivers } = useList<Driver>('drivers', '/drivers', 100, canSeeDrivers)

  const { data: clients } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () => api.get<PaginatedResponse<Client>>('/clients?page=1&size=200').then(r => r.data.items),
    enabled: canSeeClients && editing,
  })

  const updateMutation = useMutation({
    mutationFn: (body: object) => api.patch<Trip>(`/trips/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip', id] })
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setEditing(false)
      setCancelConfirm(false)
    },
  })

  const startMutation = useMutation({
    mutationFn: async () => {
      // Capturamos GPS en background; si falla, arrancamos igual sin coords.
      const coords = await captureLocation()
      const body = coords ? { start_lat: coords.lat, start_lng: coords.lng } : {}
      return api.post<Trip>(`/trips/${id}/start`, body).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['trips', 'active'] })
      qc.invalidateQueries({ queryKey: ['trips', 'pending'] })
      navigate('/delivery')
    },
  })

  const vehicle = vehicles?.find(v => v.id === trip?.vehicle_id)
  const driver = drivers?.find(d => d.id === trip?.driver_id)

  function startEditing() {
    if (!trip) return
    setEditForm({
      associated_document: trip.associated_document ?? '',
      origin: trip.origin,
      destination: trip.destination,
      notes: trip.notes ?? '',
      stops_count: trip.stops_count?.toString() ?? '',
      start_odometer: trip.start_odometer?.toString() ?? '',
      client_id: trip.client_id ?? '',
    })
    setEditing(true)
    setCancelConfirm(false)
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate({
      associated_document: editForm.associated_document || null,
      origin: editForm.origin,
      destination: editForm.destination,
      notes: editForm.notes || null,
      stops_count: editForm.stops_count ? parseInt(editForm.stops_count) : null,
      start_odometer: editForm.start_odometer ? parseInt(editForm.start_odometer) : null,
      client_id: editForm.client_id || null,
    })
  }

  function ef(k: keyof EF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <div className="text-center py-20 text-gray-400 text-sm">Cargando...</div>
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Link to="/trips" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={16} /> Viajes
        </Link>
        <p className="text-center py-20 text-gray-500 text-sm">Viaje no encontrado.</p>
      </div>
    )
  }

  const isActive = trip.status === 'pendiente' || trip.status === 'en_curso'
  const kmDriven = trip.start_odometer && trip.end_odometer ? trip.end_odometer - trip.start_odometer : null

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <Link to="/trips" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft size={16} />
          Viajes
        </Link>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[trip.status]}`}>
          {STATUS_LABEL[trip.status]}
        </span>
      </div>

      {/* Title */}
      <h1 className="text-xl font-bold text-gray-900 mb-0.5">
        {trip.associated_document ?? trip.destination}
      </h1>
      {trip.associated_document && (
        <p className="text-sm text-gray-500 mb-5">{trip.origin} → {trip.destination}</p>
      )}
      {!trip.associated_document && <div className="mb-5" />}

      {/* Info card */}
      {!editing && (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 mb-4">
          {vehicle && (
            <Row icon={Truck}>
              <p className="text-sm font-semibold text-gray-900 font-mono">{vehicle.plate}</p>
              <p className="text-xs text-gray-400">{vehicle.brand} {vehicle.model}</p>
            </Row>
          )}
          {driver && (
            <Row icon={User}>
              <p className="text-sm text-gray-700">{driver.full_name}</p>
            </Row>
          )}
          <Row icon={MapPin}>
            <p className="text-sm text-gray-700">{trip.origin} → {trip.destination}</p>
          </Row>
          {(trip.stops_count != null || (stops && stops.length > 0)) && (
            <Row icon={Package}>
              <p className="text-sm text-gray-700">
                {stops != null
                  ? trip.stops_count != null
                    ? `${stops.length} / ${trip.stops_count} paradas`
                    : `${stops.length} parada${stops.length !== 1 ? 's' : ''}`
                  : `${trip.stops_count} paradas planificadas`}
              </p>
            </Row>
          )}
          <Row icon={Gauge}>
            {trip.start_odometer && (
              <p className="text-sm text-gray-700">
                Inicio: {trip.start_odometer.toLocaleString('es-AR')} km
              </p>
            )}
            {trip.end_odometer && (
              <p className="text-sm text-gray-700">
                Fin: {trip.end_odometer.toLocaleString('es-AR')} km
              </p>
            )}
            {kmDriven !== null && (
              <p className="text-xs text-gray-400">{kmDriven.toLocaleString('es-AR')} km recorridos</p>
            )}
            {!trip.start_odometer && !trip.end_odometer && (
              <p className="text-sm text-gray-400">Sin odómetro registrado</p>
            )}
          </Row>
          {(trip.start_time || trip.end_time) && (
            <Row icon={Clock}>
              {trip.start_time && <p className="text-sm text-gray-700">Inicio: {formatDT(trip.start_time)}</p>}
              {trip.end_time && <p className="text-sm text-gray-700">Fin: {formatDT(trip.end_time)}</p>}
            </Row>
          )}
          {trip.notes && (
            <Row icon={FileText}>
              <p className="text-sm text-gray-600">{trip.notes}</p>
            </Row>
          )}
        </div>
      )}

      {/* Resumen del viaje (solo viajes completados) */}
      {!editing && trip.status === 'completado' && (() => {
        const durationS = trip.start_time && trip.end_time
          ? (new Date(trip.end_time).getTime() - new Date(trip.start_time).getTime()) / 1000
          : null
        const deliveries = stops?.length ?? 0
        const deliveriesPerHour = durationS && durationS > 0 && deliveries > 0
          ? (deliveries / (durationS / 3600))
          : null
        // Tiempo promedio entre entregas (mediana sería más robusto, pero con 5-20 stops el promedio basta).
        let avgBetweenS: number | null = null
        if (stops && stops.length >= 2) {
          const sorted = [...stops].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
          const diffs: number[] = []
          for (let i = 1; i < sorted.length; i++) {
            diffs.push((new Date(sorted[i].timestamp).getTime() - new Date(sorted[i - 1].timestamp).getTime()) / 1000)
          }
          avgBetweenS = diffs.reduce((a, b) => a + b, 0) / diffs.length
        }

        return (
          <div className="bg-white rounded-xl border border-gray-200 mb-4 px-4 py-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Resumen del viaje</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Duración total</p>
                <p className="text-base font-semibold text-gray-900 mt-0.5">{formatDuration(durationS)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Distancia</p>
                <p className="text-base font-semibold text-gray-900 mt-0.5">{formatKm(routeSummary?.distance_m ?? null)}</p>
                {routeSummary?.duration_s != null && (
                  <p className="text-xs text-gray-400 mt-0.5">{formatDuration(routeSummary.duration_s)} manejando</p>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Entregas</p>
                <p className="text-base font-semibold text-gray-900 mt-0.5">
                  {deliveries}{trip.stops_count != null ? ` / ${trip.stops_count}` : ''}
                </p>
                {deliveriesPerHour != null && (
                  <p className="text-xs text-gray-400 mt-0.5">{deliveriesPerHour.toFixed(1)} por hora</p>
                )}
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Promedio entre entregas</p>
                <p className="text-base font-semibold text-gray-900 mt-0.5">{formatDuration(avgBetweenS)}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Editando viaje</p>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Documento asociado</label>
            <input value={editForm.associated_document} onChange={e => ef('associated_document', e.target.value)} placeholder="Remito, factura..." className={CI} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Origen</label>
              <input required value={editForm.origin} onChange={e => ef('origin', e.target.value)} className={CI} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Destino</label>
              <input required value={editForm.destination} onChange={e => ef('destination', e.target.value)} className={CI} />
            </div>
          </div>
          {trip.status === 'pendiente' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Paradas planificadas</label>
                <input type="number" min="0" value={editForm.stops_count} onChange={e => ef('stops_count', e.target.value)} placeholder="12" className={CI} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Km odómetro inicio</label>
                <input type="number" min="0" value={editForm.start_odometer} onChange={e => ef('start_odometer', e.target.value)} placeholder="km" className={CI} />
              </div>
            </div>
          )}
          {canSeeClients && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cliente</label>
              <select value={editForm.client_id} onChange={e => ef('client_id', e.target.value)} className={CS}>
                <option value="">Sin cliente</option>
                {clients?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
            <textarea value={editForm.notes} onChange={e => ef('notes', e.target.value)} rows={3} className={CI + ' resize-none'} placeholder="Notas del viaje..." />
          </div>
          {updateMutation.isError && (
            <p className="text-xs text-red-600 text-center">
              {(updateMutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Error al guardar.'}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={updateMutation.isPending} className="flex-1 bg-blue-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50">
              {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="flex-1 border border-gray-200 text-sm py-2.5 rounded-lg text-gray-600 bg-white">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Cancel confirm */}
      {cancelConfirm && !editing && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <p className="text-sm font-semibold text-red-700">¿Cancelar este viaje?</p>
          </div>
          <p className="text-xs text-red-600 mb-4">Esta acción no se puede deshacer.</p>
          <div className="flex gap-2">
            <button
              onClick={() => updateMutation.mutate({ status: 'cancelado' })}
              disabled={updateMutation.isPending}
              className="flex-1 bg-red-600 text-white text-sm font-semibold py-2.5 rounded-lg disabled:opacity-50"
            >
              {updateMutation.isPending ? 'Cancelando...' : 'Sí, cancelar'}
            </button>
            <button onClick={() => setCancelConfirm(false)} className="flex-1 border border-gray-200 text-sm py-2.5 rounded-lg text-gray-600 bg-white">
              Volver
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!editing && !cancelConfirm && (
        <div className="space-y-2 mb-6">
          {trip.status === 'pendiente' && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              {startMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {startMutation.isPending ? 'Iniciando...' : 'Iniciar reparto'}
            </button>
          )}
          {trip.status === 'en_curso' && (
            <button
              onClick={() => navigate('/delivery')}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              <Play size={16} />
              Continuar reparto
            </button>
          )}
          {canEdit && isActive && (
            <>
              <button
                onClick={startEditing}
                className="w-full flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-xl transition-colors text-sm"
              >
                <Edit2 size={15} />
                Editar viaje
              </button>
              <button
                onClick={() => setCancelConfirm(true)}
                className="w-full flex items-center justify-center gap-2 border border-red-200 hover:bg-red-50 text-red-600 font-medium py-3 rounded-xl transition-colors text-sm"
              >
                <X size={15} />
                Cancelar viaje
              </button>
            </>
          )}
        </div>
      )}

      {mapOpen && stops && id && (
        <TripStopsMapModal
          tripId={id}
          stops={stops}
          startLat={trip.start_lat}
          startLng={trip.start_lng}
          endLat={trip.end_lat}
          endLng={trip.end_lng}
          onClose={() => setMapOpen(false)}
        />
      )}

      {/* Stops list */}
      {stops && stops.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Entregas registradas ({stops.length}{trip.stops_count ? ` / ${trip.stops_count}` : ''})
            </h2>
            <button
              onClick={() => setMapOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <MapIcon size={14} />
              Ver mapa
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {stops.map((stop, i) => (
              <div key={stop.id} className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-gray-700">
                    <span className="font-semibold text-gray-400 mr-1.5">#{i + 1}</span>
                    {stop.notes ?? 'Sin observaciones'}
                    {stop.is_extra && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        Extra
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(stop.timestamp).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <a
                  href={`https://maps.google.com/?q=${stop.lat},${stop.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium shrink-0"
                >
                  Ver mapa
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
