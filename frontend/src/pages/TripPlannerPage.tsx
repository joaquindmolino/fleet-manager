import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, Loader2,
  CheckCircle, RotateCcw, Search, X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import type { LeafletMap, LeafletLayer } from '@/lib/leaflet'
import type { Driver, Trip, Vehicle } from '@/types'

// Paleta de colores: claves usadas como valor en BD + hex usado para CSS/SVG.
const PIN_COLORS: { key: string; hex: string; label: string }[] = [
  { key: 'gray',   hex: '#6b7280', label: 'Gris' },
  { key: 'red',    hex: '#dc2626', label: 'Rojo' },
  { key: 'orange', hex: '#f97316', label: 'Naranja' },
  { key: 'yellow', hex: '#eab308', label: 'Amarillo' },
  { key: 'green',  hex: '#16a34a', label: 'Verde' },
  { key: 'blue',   hex: '#2563eb', label: 'Azul' },
  { key: 'purple', hex: '#9333ea', label: 'Violeta' },
  { key: 'pink',   hex: '#ec4899', label: 'Rosa' },
]

const LINE_COLOR_PALETTE: string[] = [
  '#dc2626', '#2563eb', '#16a34a', '#f97316', '#9333ea', '#0891b2', '#ca8a04', '#e11d48',
]

function pinHex(color: string | null | undefined): string {
  return PIN_COLORS.find(c => c.key === color)?.hex ?? '#6b7280'
}

function nextLineColor(used: (string | null | undefined)[]): string {
  for (const c of LINE_COLOR_PALETTE) {
    if (!used.includes(c)) return c
  }
  return LINE_COLOR_PALETTE[used.length % LINE_COLOR_PALETTE.length]
}

interface PoolLocation {
  id: string
  alias: string | null
  address: string
  lat: number
  lng: number
  notes: string | null
  pin_color: string
}

interface PlannedStop {
  id: string
  trip_id: string
  sequence: number
  alias: string | null
  address: string
  lat: number
  lng: number
  service_minutes: number
  notes: string | null
  pin_color: string
}

interface DraftTrip extends Trip {
  // planned_stops se carga aparte por endpoint
}

interface RouteGeometry {
  geometry: [number, number][]
  distance_m: number | null
  duration_s: number | null
}

function formatKm(m: number | null | undefined): string {
  if (m == null) return '—'
  return `${(m / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`
}

function formatDuration(s: number | null | undefined): string {
  if (s == null) return '—'
  const h = Math.floor(s / 3600)
  const min = Math.floor((s % 3600) / 60)
  if (h === 0) return `${min} min`
  if (min === 0) return `${h} h`
  return `${h} h ${min} min`
}

export default function TripPlannerPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Datos de la app
  const { data: drivers = [] } = useList<Driver>('drivers', '/drivers', 200, true)
  const { data: vehicles = [] } = useList<Vehicle>('vehicles', '/vehicles', 200, true)

  // Pool
  const { data: pool = [] } = useQuery({
    queryKey: ['pool-locations'],
    queryFn: () => api.get<PoolLocation[]>('/pool-locations').then(r => r.data),
  })

  // Viajes en borrador (solo de este coordinador en construcción)
  const { data: draftsResponse } = useQuery({
    queryKey: ['trips', 'drafts'],
    queryFn: () => api.get<{ items: DraftTrip[] }>('/trips?page=1&size=50').then(r => r.data),
  })
  const drafts = useMemo(
    () => (draftsResponse?.items ?? []).filter(t => t.status === 'borrador'),
    [draftsResponse],
  )

  // Estado UI
  const [selectedPoolIds, setSelectedPoolIds] = useState<Set<string>>(new Set())
  const [expandedTripIds, setExpandedTripIds] = useState<Set<string>>(new Set())
  const [editingPoolId, setEditingPoolId] = useState<string | null>(null)
  const [addingToPool, setAddingToPool] = useState(false)
  const [newPoolForm, setNewPoolForm] = useState({ alias: '', address: '', lat: null as number | null, lng: null as number | null, notes: '', pin_color: 'gray' })
  const [poolSearch, setPoolSearch] = useState('')

  const filteredPool = useMemo(() => {
    const q = poolSearch.trim().toLowerCase()
    if (!q) return pool
    return pool.filter(p =>
      (p.alias ?? '').toLowerCase().includes(q) ||
      p.address.toLowerCase().includes(q) ||
      (p.notes ?? '').toLowerCase().includes(q)
    )
  }, [pool, poolSearch])

  // Paradas planificadas por viaje (cargadas on-demand al expandir)
  const tripStopsQueries = useQuery({
    queryKey: ['all-trip-planned-stops', drafts.map(t => t.id).sort().join(',')],
    queryFn: async () => {
      const entries = await Promise.all(
        drafts.map(t => api.get<PlannedStop[]>(`/trips/${t.id}/planned-stops`).then(r => [t.id, r.data] as [string, PlannedStop[]]))
      )
      return Object.fromEntries(entries) as Record<string, PlannedStop[]>
    },
    enabled: drafts.length > 0,
  })
  const stopsByTrip = tripStopsQueries.data ?? {}

  // Geometría OSRM por viaje (cargadas on-demand)
  const [tripRoutes, setTripRoutes] = useState<Record<string, RouteGeometry>>({})
  useEffect(() => {
    drafts.forEach(t => {
      const stops = stopsByTrip[t.id]
      if (!stops || stops.length < 2) return
      const key = stops.map(s => `${s.lat.toFixed(6)},${s.lng.toFixed(6)}`).join('|')
      if (tripRoutes[t.id] && tripRoutes[t.id].geometry.length > 0 &&
          // Misma cantidad de puntos = asumimos misma ruta (no perfecto pero suficiente)
          tripRoutes[t.id].geometry.length >= stops.length) {
        return
      }
      api.post<RouteGeometry>('/routing/route', { coordinates: stops.map(s => [s.lng, s.lat]) })
        .then(r => setTripRoutes(prev => ({ ...prev, [t.id]: r.data })))
        .catch(() => { /* silencioso, dejamos sin polyline */ })
      void key
    })
  }, [drafts, stopsByTrip])

  // Mutations
  const addPoolMutation = useMutation({
    mutationFn: (body: Omit<PoolLocation, 'id'>) => api.post<PoolLocation>('/pool-locations', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pool-locations'] })
      setAddingToPool(false)
      setNewPoolForm({ alias: '', address: '', lat: null, lng: null, notes: '', pin_color: 'gray' })
    },
  })

  const updatePoolMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PoolLocation> }) =>
      api.patch(`/pool-locations/${id}`, patch).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pool-locations'] }),
  })

  const deletePoolMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pool-locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pool-locations'] }),
  })

  const createTripMutation = useMutation({
    mutationFn: async (vehicleId: string) => {
      const lineColor = nextLineColor(drafts.map(d => d.line_color))
      return api.post<Trip>('/trips', {
        vehicle_id: vehicleId,
        status: 'borrador',
        origin: 'Por definir',
        destination: 'Por definir',
        line_color: lineColor,
      }).then(r => r.data)
    },
    onSuccess: (trip) => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['trips', 'drafts'] })
      setExpandedTripIds(prev => new Set([...prev, trip.id]))
    },
  })

  const assignToTripMutation = useMutation({
    mutationFn: ({ tripId, locationIds }: { tripId: string; locationIds: string[] }) =>
      api.post(`/pool-locations/assign-to-trip/${tripId}`, { location_ids: locationIds }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pool-locations'] })
      qc.invalidateQueries({ queryKey: ['all-trip-planned-stops'] })
      setSelectedPoolIds(new Set())
    },
  })

  const returnToPoolMutation = useMutation({
    mutationFn: ({ tripId, stopId }: { tripId: string; stopId: string }) =>
      api.post(`/pool-locations/return-from-trip/${tripId}/${stopId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pool-locations'] })
      qc.invalidateQueries({ queryKey: ['all-trip-planned-stops'] })
    },
  })

  const updateTripMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Trip> }) =>
      api.patch(`/trips/${id}`, patch).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', 'drafts'] })
      qc.invalidateQueries({ queryKey: ['trips'] })
    },
  })

  const deleteTripMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/trips/${id}`, { status: 'cancelado' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', 'drafts'] })
      qc.invalidateQueries({ queryKey: ['trips'] })
    },
  })

  const confirmTripMutation = useMutation({
    mutationFn: (id: string) => api.patch<Trip>(`/trips/${id}`, { status: 'pendiente' }).then(r => r.data),
    onSuccess: (trip) => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['trips', 'drafts'] })
      navigate(`/trips/${trip.id}`)
    },
  })

  // Mapa Leaflet
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layersRef = useRef<LeafletLayer[]>([])

  useEffect(() => {
    const L = window.L
    if (!L || !mapContainerRef.current) return
    const map = L.map(mapContainerRef.current, { scrollWheelZoom: true })
    map.setView([-34.6, -58.4], 11)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 0)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Redibujar todo cuando cambian datos
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return

    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    const Lx = L
    function escapeHtml(s: string): string {
      return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
    }
    function pinIcon(color: string, label: string, alias: string | null) {
      const aliasHtml = alias
        ? `<div style="position:absolute;left:32px;top:6px;white-space:nowrap;background:white;
            border:1px solid ${color};border-radius:6px;padding:2px 6px;font:600 11px/1.2 system-ui,sans-serif;
            color:#111;box-shadow:0 1px 2px rgba(0,0,0,.15);pointer-events:none;">${escapeHtml(alias)}</div>`
        : ''
      return Lx.divIcon({
        className: '',
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        html: `<div style="position:relative;">
          <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" style="display:block;">
            <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"
              fill="${color}" stroke="white" stroke-width="2"/>
            <text x="14" y="18" font-family="Arial, sans-serif" font-size="10" font-weight="bold"
              fill="white" text-anchor="middle">${label}</text>
          </svg>${aliasHtml}</div>`,
      })
    }

    function shortLabel(alias: string | null, address: string): string {
      const a = (alias ?? '').trim()
      if (a) return a
      const first = (address || '').split(',')[0].trim()
      return first.length > 28 ? first.slice(0, 28) + '…' : first
    }

    // Pool: pins con color de categoría + alias visible
    pool.forEach(p => {
      const icon = pinIcon(pinHex(p.pin_color), '', shortLabel(p.alias, p.address))
      layersRef.current.push(L.marker([p.lat, p.lng], { icon }).addTo(map))
    })

    // Cada viaje: pins con número, alias visible, y línea con su line_color
    drafts.forEach(t => {
      const stops = stopsByTrip[t.id] ?? []
      const lineColor = t.line_color ?? '#3b82f6'
      const route = tripRoutes[t.id]
      const polyPoints = route?.geometry ?? stops.map(s => [s.lat, s.lng] as [number, number])
      if (polyPoints.length >= 2) {
        layersRef.current.push(L.polyline(polyPoints, {
          color: lineColor, weight: 4, opacity: 0.8,
          dashArray: route ? undefined : '6 6',
        }).addTo(map))
      }
      stops.forEach((s, i) => {
        const icon = pinIcon(pinHex(s.pin_color), String(i + 1), shortLabel(s.alias, s.address))
        layersRef.current.push(L.marker([s.lat, s.lng], { icon }).addTo(map))
      })
    })

    // Fit bounds: todos los puntos
    const allPoints: [number, number][] = [
      ...pool.map(p => [p.lat, p.lng] as [number, number]),
      ...drafts.flatMap(t => (stopsByTrip[t.id] ?? []).map(s => [s.lat, s.lng] as [number, number])),
    ]
    if (allPoints.length === 1) map.setView(allPoints[0], 14)
    else if (allPoints.length >= 2) map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] })
  }, [pool, drafts, stopsByTrip, tripRoutes])

  // Acciones UI
  function togglePoolSelection(id: string) {
    setSelectedPoolIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleTripExpanded(id: string) {
    setExpandedTripIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function handleCreateTripFromSelection() {
    const firstVehicle = vehicles[0]
    if (!firstVehicle) {
      alert('Cargá al menos un vehículo antes de crear viajes.')
      return
    }
    createTripMutation.mutate(firstVehicle.id, {
      onSuccess: (trip) => {
        if (selectedPoolIds.size > 0) {
          assignToTripMutation.mutate({
            tripId: trip.id,
            locationIds: Array.from(selectedPoolIds),
          })
        }
      },
    })
  }

  function handleAddToPool() {
    if (!newPoolForm.address || newPoolForm.lat == null || newPoolForm.lng == null) {
      alert('Elegí una dirección del autocompletado.')
      return
    }
    addPoolMutation.mutate({
      alias: newPoolForm.alias || null,
      address: newPoolForm.address,
      lat: newPoolForm.lat,
      lng: newPoolForm.lng,
      notes: newPoolForm.notes || null,
      pin_color: newPoolForm.pin_color,
    })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/trips" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-base font-bold text-gray-900">Despachador</h1>
            <p className="text-xs text-gray-400">{pool.length} en el pool · {drafts.length} viaje{drafts.length !== 1 ? 's' : ''} en borrador</p>
          </div>
        </div>
      </div>

      {/* Contenido: mapa + sidebar */}
      <div className="flex-1 flex overflow-hidden">

        {/* Mapa */}
        <div ref={mapContainerRef} className="flex-1 min-w-0" />

        {/* Sidebar */}
        <aside className="w-[380px] shrink-0 border-l border-gray-200 bg-gray-50 overflow-y-auto">
          <div className="p-3 space-y-3">

            {/* POOL */}
            <section className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Pool ({poolSearch ? `${filteredPool.length} / ${pool.length}` : pool.length})
                </h2>
                <button onClick={() => setAddingToPool(v => !v)}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1">
                  <Plus size={13} /> Agregar
                </button>
              </div>

              {/* Buscador */}
              {pool.length > 0 && (
                <div className="px-3 pt-2 pb-1">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Buscar por alias, dirección u observación..."
                      value={poolSearch}
                      onChange={e => setPoolSearch(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg pl-7 pr-7 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {poolSearch && (
                      <button
                        onClick={() => setPoolSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Form de agregar */}
              {addingToPool && (
                <div className="p-3 border-b border-gray-100 space-y-2 bg-blue-50/30">
                  <input
                    type="text"
                    placeholder="Alias (opcional)"
                    value={newPoolForm.alias}
                    onChange={e => setNewPoolForm(f => ({ ...f, alias: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <AddressAutocomplete
                    value={newPoolForm.address}
                    onChange={text => setNewPoolForm(f => ({ ...f, address: text, lat: null, lng: null }))}
                    onSelect={picked => setNewPoolForm(f => ({ ...f, address: picked.label, lat: picked.lat, lng: picked.lng }))}
                  />
                  <textarea
                    placeholder="Observaciones..."
                    value={newPoolForm.notes}
                    onChange={e => setNewPoolForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <ColorPicker value={newPoolForm.pin_color} onChange={c => setNewPoolForm(f => ({ ...f, pin_color: c }))} />
                  <div className="flex gap-2">
                    <button onClick={() => setAddingToPool(false)}
                      className="flex-1 border border-gray-200 rounded-lg py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                      Cancelar
                    </button>
                    <button onClick={handleAddToPool} disabled={addPoolMutation.isPending}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg py-1.5">
                      {addPoolMutation.isPending ? 'Guardando...' : 'Agregar al pool'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lista */}
              <div className="divide-y divide-gray-50">
                {pool.length === 0 && !addingToPool ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    No hay ubicaciones pendientes. Tocá "Agregar" para empezar.
                  </div>
                ) : filteredPool.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-400">
                    Ningún resultado para "{poolSearch}".
                  </div>
                ) : filteredPool.map(p => (
                  <PoolItem
                    key={p.id}
                    item={p}
                    selected={selectedPoolIds.has(p.id)}
                    editing={editingPoolId === p.id}
                    onToggle={() => togglePoolSelection(p.id)}
                    onEdit={() => setEditingPoolId(p.id)}
                    onSaveEdit={(patch) => { updatePoolMutation.mutate({ id: p.id, patch }); setEditingPoolId(null) }}
                    onCancelEdit={() => setEditingPoolId(null)}
                    onDelete={() => deletePoolMutation.mutate(p.id)}
                  />
                ))}
              </div>

              {/* Acciones bulk si hay selección */}
              {selectedPoolIds.size > 0 && (
                <div className="p-3 border-t border-gray-100 bg-blue-50/50 space-y-2">
                  <p className="text-xs text-gray-600">{selectedPoolIds.size} seleccionada{selectedPoolIds.size !== 1 ? 's' : ''}</p>
                  <button onClick={handleCreateTripFromSelection}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg py-2 flex items-center justify-center gap-1.5">
                    <Plus size={13} /> Crear viaje con seleccionadas
                  </button>
                  {drafts.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">O sumá a un viaje existente:</p>
                      {drafts.map(t => (
                        <button
                          key={t.id}
                          onClick={() => assignToTripMutation.mutate({ tripId: t.id, locationIds: Array.from(selectedPoolIds) })}
                          className="w-full flex items-center gap-2 border border-gray-200 hover:bg-white rounded-lg px-2 py-1.5 text-xs"
                        >
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.line_color ?? '#6b7280' }} />
                          <span className="truncate text-gray-700">{t.associated_document ?? `Viaje del ${new Date(t.created_at).toLocaleDateString('es-AR')}`}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* VIAJES EN BORRADOR */}
            <section className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Viajes ({drafts.length})
                </h2>
                <button
                  onClick={() => {
                    const v = vehicles[0]
                    if (!v) { alert('Cargá un vehículo primero.'); return }
                    createTripMutation.mutate(v.id)
                  }}
                  disabled={createTripMutation.isPending}
                  className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center gap-1"
                >
                  <Plus size={13} /> Nuevo viaje
                </button>
              </div>
              {drafts.length === 0 ? (
                <div className="p-6 text-center text-xs text-gray-400">
                  Todavía no creaste viajes. Seleccioná ubicaciones del pool y agrupalas.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {drafts.map(t => (
                    <DraftTripCard
                      key={t.id}
                      trip={t}
                      stops={stopsByTrip[t.id] ?? []}
                      route={tripRoutes[t.id] ?? null}
                      drivers={drivers}
                      vehicles={vehicles}
                      expanded={expandedTripIds.has(t.id)}
                      onToggle={() => toggleTripExpanded(t.id)}
                      onUpdate={(patch) => updateTripMutation.mutate({ id: t.id, patch })}
                      onDelete={() => deleteTripMutation.mutate(t.id)}
                      onConfirm={() => confirmTripMutation.mutate(t.id)}
                      onReturnStop={(stopId) => returnToPoolMutation.mutate({ tripId: t.id, stopId })}
                      confirming={confirmTripMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </section>

          </div>
        </aside>
      </div>
    </div>
  )
}

// ===== Subcomponentes =====

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-500 uppercase tracking-wide mr-1">Color:</span>
      {PIN_COLORS.map(c => (
        <button
          key={c.key}
          type="button"
          onClick={() => onChange(c.key)}
          title={c.label}
          className={`w-5 h-5 rounded-full border-2 transition-transform ${value === c.key ? 'border-gray-800 scale-110' : 'border-white'}`}
          style={{ backgroundColor: c.hex }}
        />
      ))}
    </div>
  )
}

function PoolItem({
  item, selected, editing, onToggle, onEdit, onSaveEdit, onCancelEdit, onDelete,
}: {
  item: PoolLocation
  selected: boolean
  editing: boolean
  onToggle: () => void
  onEdit: () => void
  onSaveEdit: (patch: Partial<PoolLocation>) => void
  onCancelEdit: () => void
  onDelete: () => void
}) {
  const [alias, setAlias] = useState(item.alias ?? '')
  const [notes, setNotes] = useState(item.notes ?? '')
  const [color, setColor] = useState(item.pin_color)

  if (editing) {
    return (
      <div className="p-3 bg-blue-50/30 space-y-2">
        <input
          type="text"
          placeholder="Alias"
          value={alias}
          onChange={e => setAlias(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        />
        <textarea
          placeholder="Observaciones"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-none"
        />
        <ColorPicker value={color} onChange={setColor} />
        <div className="flex gap-2">
          <button onClick={onCancelEdit}
            className="flex-1 border border-gray-200 rounded-lg py-1 text-xs text-gray-600">
            Cancelar
          </button>
          <button onClick={() => onSaveEdit({ alias: alias || null, notes: notes || null, pin_color: color })}
            className="flex-1 bg-blue-600 text-white text-xs font-medium rounded-lg py-1">
            Guardar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`px-3 py-2 flex items-start gap-2 ${selected ? 'bg-blue-50' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 shrink-0"
      />
      <span
        className="w-3 h-3 rounded-full shrink-0 mt-1.5"
        style={{ backgroundColor: pinHex(item.pin_color) }}
      />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-gray-800 truncate">{item.alias ?? item.address.split(',')[0]}</p>
        <p className="text-xs text-gray-400 truncate">{item.address}</p>
        {item.notes && <p className="text-xs text-gray-500 italic truncate mt-0.5">{item.notes}</p>}
      </button>
      <button onClick={onDelete} className="text-gray-300 hover:text-red-500 shrink-0 p-1">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

function DraftTripCard({
  trip, stops, route, drivers, vehicles, expanded, onToggle, onUpdate, onDelete, onConfirm, onReturnStop, confirming,
}: {
  trip: DraftTrip
  stops: PlannedStop[]
  route: RouteGeometry | null
  drivers: Driver[]
  vehicles: Vehicle[]
  expanded: boolean
  onToggle: () => void
  onUpdate: (patch: Partial<Trip>) => void
  onDelete: () => void
  onConfirm: () => void
  onReturnStop: (stopId: string) => void
  confirming: boolean
}) {
  const driver = drivers.find(d => d.id === trip.driver_id)

  return (
    <div>
      <button onClick={onToggle} className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50">
        {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: trip.line_color ?? '#6b7280' }} />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-gray-800 truncate">
            {trip.associated_document ?? `Viaje ${new Date(trip.created_at).toLocaleDateString('es-AR')}`}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {stops.length} parada{stops.length !== 1 ? 's' : ''}
            {driver && ` · ${driver.full_name}`}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50/50">
          {/* Editar datos del viaje */}
          <div className="space-y-2 pt-2">
            <input
              type="text"
              placeholder="Identificador (remito, ruta...)"
              defaultValue={trip.associated_document ?? ''}
              onBlur={e => {
                const v = e.target.value
                if (v !== (trip.associated_document ?? '')) onUpdate({ associated_document: v || null })
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={trip.driver_id ?? ''}
                onChange={e => onUpdate({ driver_id: e.target.value || null })}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                <option value="">Sin chofer</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
              <select
                value={trip.vehicle_id ?? ''}
                onChange={e => onUpdate({ vehicle_id: e.target.value })}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
              >
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}
              </select>
            </div>
          </div>

          {/* Resumen ruta */}
          {route && (
            <div className="flex gap-2 text-xs text-gray-500">
              <span>{formatKm(route.distance_m)}</span>
              <span>·</span>
              <span>{formatDuration(route.duration_s)}</span>
            </div>
          )}

          {/* Paradas */}
          {stops.length === 0 ? (
            <div className="text-center py-3 text-xs text-gray-400 italic">
              Sin paradas. Seleccioná del pool y asignalas.
            </div>
          ) : (
            <div className="space-y-1">
              {stops.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 bg-white rounded border border-gray-200">
                  <span
                    className="w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: pinHex(s.pin_color) }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{s.alias ?? s.address.split(',')[0]}</p>
                    {s.notes && <p className="text-[10px] text-gray-500 italic truncate">{s.notes}</p>}
                  </div>
                  <button onClick={() => onReturnStop(s.id)} title="Devolver al pool"
                    className="text-gray-300 hover:text-blue-500 shrink-0">
                    <RotateCcw size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button onClick={onDelete}
              className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 text-xs rounded-lg py-1.5">
              Descartar
            </button>
            <button onClick={onConfirm} disabled={confirming || stops.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg py-1.5 flex items-center justify-center gap-1">
              {confirming ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Confirmar viaje
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
