import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, Loader2,
  CheckCircle, RotateCcw, Search, X, GripVertical, MoreVertical, Flag,
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

interface RouteSegment {
  distance_m: number | null
  duration_s: number | null
}

interface RouteGeometry {
  geometry: [number, number][]
  distance_m: number | null
  duration_s: number | null
  segments?: RouteSegment[]
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

function formatMinShort(min: number): string {
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min - h * 60)
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function buildPinIcon(L: NonNullable<typeof window.L>, color: string, label: string, alias: string | null, highlighted: boolean): unknown {
  const size = highlighted ? 36 : 28
  const height = highlighted ? 46 : 36
  const stroke = highlighted ? '#facc15' : 'white'
  const strokeWidth = highlighted ? 3 : 2
  const fontSize = highlighted ? 13 : 10
  const labelY = highlighted ? 22 : 18
  const aliasBg = highlighted ? '#fef9c3' : 'white'
  const aliasFontSize = highlighted ? 12 : 11
  const aliasHtml = alias
    ? `<div style="position:absolute;left:${size + 4}px;top:${highlighted ? 10 : 6}px;white-space:nowrap;background:${aliasBg};
        border:1px solid ${color};border-radius:6px;padding:2px 6px;font:600 ${aliasFontSize}px/1.2 system-ui,sans-serif;
        color:#111;box-shadow:0 1px 2px rgba(0,0,0,.15);pointer-events:none;">${escapeHtml(alias)}</div>`
    : ''
  return L.divIcon({
    className: highlighted ? 'leaflet-pin-hovered' : '',
    iconSize: [size, height],
    iconAnchor: [size / 2, height],
    html: `<div style="position:relative;">
      <svg width="${size}" height="${height}" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg" style="display:block;">
        <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z"
          fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
        <text x="14" y="${labelY}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold"
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
  const [hoveredPoolId, setHoveredPoolId] = useState<string | null>(null)
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null)

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
  // Firma actual de cada ruta para detectar cambios (origen + paradas).
  const routeSigRef = useRef<Record<string, string>>({})
  useEffect(() => {
    drafts.forEach(t => {
      const stops = stopsByTrip[t.id] ?? []
      const hasOrigin = t.start_lat != null && t.start_lng != null
      const coords: [number, number][] = []
      if (hasOrigin) coords.push([t.start_lng!, t.start_lat!])
      coords.push(...stops.map(s => [s.lng, s.lat] as [number, number]))
      if (coords.length < 2) return
      const sig = coords.map(c => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join('|')
      if (routeSigRef.current[t.id] === sig) return
      routeSigRef.current[t.id] = sig
      api.post<RouteGeometry>('/routing/route', { coordinates: coords })
        .then(r => setTripRoutes(prev => ({ ...prev, [t.id]: r.data })))
        .catch(() => { /* silencioso, dejamos sin polyline */ })
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

  const reorderStopsMutation = useMutation({
    mutationFn: ({ tripId, stopIds }: { tripId: string; stopIds: string[] }) =>
      api.post(`/trips/${tripId}/planned-stops/reorder`, stopIds).then(r => r.data),
    onMutate: async ({ tripId, stopIds }) => {
      await qc.cancelQueries({ queryKey: ['all-trip-planned-stops'] })
      const prev = qc.getQueryData<Record<string, PlannedStop[]>>(
        ['all-trip-planned-stops', drafts.map(t => t.id).sort().join(',')]
      )
      if (prev) {
        const current = prev[tripId] ?? []
        const byId = new Map(current.map(s => [s.id, s]))
        const next = stopIds.map((id, i) => {
          const s = byId.get(id)!
          return { ...s, sequence: i }
        })
        qc.setQueryData(
          ['all-trip-planned-stops', drafts.map(t => t.id).sort().join(',')],
          { ...prev, [tripId]: next },
        )
      }
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(['all-trip-planned-stops', drafts.map(t => t.id).sort().join(',')], ctx.prev)
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['all-trip-planned-stops'] }),
  })

  const moveStopMutation = useMutation({
    mutationFn: ({ tripId, stopId, targetTripId }: { tripId: string; stopId: string; targetTripId: string }) =>
      api.post(`/trips/${tripId}/planned-stops/${stopId}/move-to/${targetTripId}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-trip-planned-stops'] }),
  })

  const updateStopMutation = useMutation({
    mutationFn: ({ tripId, stopId, patch }: { tripId: string; stopId: string; patch: Partial<PlannedStop> }) =>
      api.patch(`/trips/${tripId}/planned-stops/${stopId}`, patch).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-trip-planned-stops'] }),
  })

  const promoteToOriginMutation = useMutation({
    mutationFn: ({ tripId, stopId }: { tripId: string; stopId: string }) =>
      api.post(`/trips/${tripId}/planned-stops/${stopId}/promote-to-origin`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips', 'drafts'] })
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
  const poolMarkerRefs = useRef<Map<string, LeafletLayer>>(new Map())
  const stopMarkerRefs = useRef<Map<string, LeafletLayer>>(new Map())
  const lastFitSigRef = useRef<string>('')

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

  // Redibujar markers/polylines cuando cambian los datos (no en hover).
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return

    layersRef.current.forEach(l => l.remove())
    layersRef.current = []
    poolMarkerRefs.current.clear()
    stopMarkerRefs.current.clear()

    // Pool
    pool.forEach(p => {
      const icon = buildPinIcon(L, pinHex(p.pin_color), '', shortLabel(p.alias, p.address), false)
      const marker = L.marker([p.lat, p.lng], { icon })
      marker.on('mouseover', () => setHoveredPoolId(p.id))
      marker.on('mouseout', () => setHoveredPoolId(null))
      marker.addTo(map)
      layersRef.current.push(marker)
      poolMarkerRefs.current.set(p.id, marker)
    })

    // Viajes
    drafts.forEach(t => {
      const stops = stopsByTrip[t.id] ?? []
      const lineColor = t.line_color ?? '#3b82f6'
      const route = tripRoutes[t.id]
      const hasOrigin = t.start_lat != null && t.start_lng != null
      const fallbackPoly: [number, number][] = []
      if (hasOrigin) fallbackPoly.push([t.start_lat!, t.start_lng!])
      fallbackPoly.push(...stops.map(s => [s.lat, s.lng] as [number, number]))
      const polyPoints = route?.geometry ?? fallbackPoly
      if (polyPoints.length >= 2) {
        layersRef.current.push(L.polyline(polyPoints, {
          color: lineColor, weight: 4, opacity: 0.8,
          dashArray: route ? undefined : '6 6',
        }).addTo(map))
      }
      // Pin de inicio (verde con S)
      if (hasOrigin) {
        const startIcon = buildPinIcon(L, '#16a34a', 'S', `Inicio: ${shortLabel(null, t.origin)}`, false)
        const marker = L.marker([t.start_lat!, t.start_lng!], { icon: startIcon })
        marker.addTo(map)
        layersRef.current.push(marker)
      }
      stops.forEach((s, i) => {
        const icon = buildPinIcon(L, pinHex(s.pin_color), String(i + 1), shortLabel(s.alias, s.address), false)
        const marker = L.marker([s.lat, s.lng], { icon })
        marker.on('mouseover', () => setHoveredStopId(s.id))
        marker.on('mouseout', () => setHoveredStopId(null))
        marker.addTo(map)
        layersRef.current.push(marker)
        stopMarkerRefs.current.set(s.id, marker)
      })
    })

    // Fit bounds solo si el conjunto de puntos realmente cambió.
    const allPoints: [number, number][] = [
      ...pool.map(p => [p.lat, p.lng] as [number, number]),
      ...drafts.flatMap(t => {
        const sp = (stopsByTrip[t.id] ?? []).map(s => [s.lat, s.lng] as [number, number])
        if (t.start_lat != null && t.start_lng != null) sp.unshift([t.start_lat, t.start_lng])
        return sp
      }),
    ]
    const sig = allPoints.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join('|')
    if (sig !== lastFitSigRef.current && allPoints.length > 0) {
      if (allPoints.length === 1) map.setView(allPoints[0], 14)
      else map.fitBounds(L.latLngBounds(allPoints), { padding: [40, 40] })
      lastFitSigRef.current = sig
    }
  }, [pool, drafts, stopsByTrip, tripRoutes])

  // Aplicar highlight de hover sin re-renderizar todos los markers.
  useEffect(() => {
    const L = window.L
    if (!L) return
    pool.forEach(p => {
      const m = poolMarkerRefs.current.get(p.id)
      if (!m) return
      m.setIcon(buildPinIcon(L, pinHex(p.pin_color), '', shortLabel(p.alias, p.address), hoveredPoolId === p.id))
    })
    drafts.forEach(t => {
      const stops = stopsByTrip[t.id] ?? []
      stops.forEach((s, i) => {
        const m = stopMarkerRefs.current.get(s.id)
        if (!m) return
        m.setIcon(buildPinIcon(L, pinHex(s.pin_color), String(i + 1), shortLabel(s.alias, s.address), hoveredStopId === s.id))
      })
    })
  }, [hoveredPoolId, hoveredStopId, pool, drafts, stopsByTrip])

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
                    hovered={hoveredPoolId === p.id}
                    onHoverChange={(on) => setHoveredPoolId(on ? p.id : null)}
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
                          <span className="truncate text-gray-700">{t.name ?? `Viaje del ${new Date(t.created_at).toLocaleDateString('es-AR')}`}</span>
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
                      otherDrafts={drafts.filter(d => d.id !== t.id)}
                      expanded={expandedTripIds.has(t.id)}
                      hoveredStopId={hoveredStopId}
                      onStopHover={(stopId, on) => setHoveredStopId(on ? stopId : null)}
                      onToggle={() => toggleTripExpanded(t.id)}
                      onUpdate={(patch) => updateTripMutation.mutate({ id: t.id, patch })}
                      onDelete={() => deleteTripMutation.mutate(t.id)}
                      onConfirm={() => confirmTripMutation.mutate(t.id)}
                      onReturnStop={(stopId) => returnToPoolMutation.mutate({ tripId: t.id, stopId })}
                      onReorder={(stopIds) => reorderStopsMutation.mutate({ tripId: t.id, stopIds })}
                      onMoveStop={(stopId, targetTripId) => moveStopMutation.mutate({ tripId: t.id, stopId, targetTripId })}
                      onUpdateStop={(stopId, patch) => updateStopMutation.mutate({ tripId: t.id, stopId, patch })}
                      onPromoteToOrigin={(stopId) => promoteToOriginMutation.mutate({ tripId: t.id, stopId })}
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
  item, selected, editing, hovered, onHoverChange, onToggle, onEdit, onSaveEdit, onCancelEdit, onDelete,
}: {
  item: PoolLocation
  selected: boolean
  editing: boolean
  hovered: boolean
  onHoverChange: (on: boolean) => void
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
    <div
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      className={`px-3 py-2 flex items-start gap-2 ${hovered ? 'bg-yellow-50 ring-1 ring-yellow-300' : selected ? 'bg-blue-50' : ''}`}
    >
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
  trip, stops, route, drivers, vehicles, otherDrafts, expanded, hoveredStopId, onStopHover, onToggle, onUpdate, onDelete, onConfirm, onReturnStop, onReorder, onMoveStop, onUpdateStop, onPromoteToOrigin, confirming,
}: {
  trip: DraftTrip
  stops: PlannedStop[]
  route: RouteGeometry | null
  drivers: Driver[]
  vehicles: Vehicle[]
  otherDrafts: DraftTrip[]
  expanded: boolean
  hoveredStopId: string | null
  onStopHover: (stopId: string, on: boolean) => void
  onToggle: () => void
  onUpdate: (patch: Partial<Trip>) => void
  onDelete: () => void
  onConfirm: () => void
  onReturnStop: (stopId: string) => void
  onReorder: (stopIds: string[]) => void
  onMoveStop: (stopId: string, targetTripId: string) => void
  onUpdateStop: (stopId: string, patch: Partial<PlannedStop>) => void
  onPromoteToOrigin: (stopId: string) => void
  confirming: boolean
}) {
  const driver = drivers.find(d => d.id === trip.driver_id)
  const [dragStopId, setDragStopId] = useState<string | null>(null)
  const dragStopIdRef = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const [moveMenuStopId, setMoveMenuStopId] = useState<string | null>(null)

  function handleStopDrop() {
    const drag = dragStopIdRef.current
    const target = dropTarget
    dragStopIdRef.current = null
    setDragStopId(null)
    setDropTarget(null)
    if (!drag || !target || drag === target.id) return
    const ids = stops.map(s => s.id)
    const fromIdx = ids.indexOf(drag)
    let toIdx = ids.indexOf(target.id)
    if (fromIdx < 0 || toIdx < 0) return
    if (target.pos === 'after') toIdx += 1
    ids.splice(fromIdx, 1)
    if (fromIdx < toIdx) toIdx -= 1
    ids.splice(toIdx, 0, drag)
    onReorder(ids)
  }

  const defaultName = `Viaje del ${new Date(trip.created_at).toLocaleDateString('es-AR')}`
  const hasOrigin = trip.start_lat != null && trip.start_lng != null
  // State local del input de Inicio: mientras escribís no impactamos al server.
  // Solo persistimos cuando se elige una sugerencia.
  const [originText, setOriginText] = useState<string>(hasOrigin ? trip.origin : '')
  useEffect(() => {
    setOriginText(hasOrigin ? trip.origin : '')
  }, [trip.origin, hasOrigin])
  const [originDropOver, setOriginDropOver] = useState(false)

  // Tiempos por parada (acumulados desde el inicio):
  // segments[i] es el tramo del coord[i] al coord[i+1]. coord[0] es origen si está, sino la primera parada.
  const stopArrivalMin = useMemo<(number | null)[]>(() => {
    if (!route?.segments?.length) return stops.map(() => null)
    const segs = route.segments
    const result: (number | null)[] = []
    let acc = 0
    for (let i = 0; i < stops.length; i++) {
      const segIdx = hasOrigin ? i : (i - 1)
      if (segIdx >= 0 && segs[segIdx]?.duration_s != null) {
        acc += segs[segIdx]!.duration_s!
        result.push(acc / 60)
      } else if (segIdx < 0) {
        result.push(0)
      } else {
        result.push(null)
      }
      // Sumar tiempo de servicio para los próximos cálculos
      acc += (stops[i].service_minutes ?? 15) * 60
    }
    return result
  }, [route, stops, hasOrigin])

  return (
    <div>
      <div className="w-full px-3 py-2.5 flex items-center gap-2 hover:bg-gray-50">
        <button onClick={onToggle} className="shrink-0 flex items-center gap-2">
          {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: trip.line_color ?? '#6b7280' }} />
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            defaultValue={trip.name ?? ''}
            key={`name-${trip.id}-${trip.name ?? ''}`}
            placeholder={defaultName}
            onBlur={e => {
              const v = e.target.value.trim()
              if (v !== (trip.name ?? '')) onUpdate({ name: v || null })
            }}
            className="w-full text-sm font-medium text-gray-800 bg-transparent border-0 outline-none focus:bg-white focus:ring-1 focus:ring-blue-300 rounded px-1 -mx-1 truncate placeholder:text-gray-500 placeholder:font-medium"
          />
          <p className="text-xs text-gray-400 truncate">
            {stops.length} parada{stops.length !== 1 ? 's' : ''}
            {driver && ` · ${driver.full_name}`}
          </p>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 bg-gray-50/50">
          {/* Editar datos del viaje */}
          <div className="space-y-2 pt-2">
            <input
              type="text"
              placeholder="Documento asociado (remito, OC...)"
              defaultValue={trip.associated_document ?? ''}
              key={`doc-${trip.id}-${trip.associated_document ?? ''}`}
              onBlur={e => {
                const v = e.target.value.trim()
                if (v !== (trip.associated_document ?? '')) onUpdate({ associated_document: v || null })
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={trip.driver_id ?? ''}
                onChange={e => {
                  const driverId = e.target.value || null
                  const picked = drivers.find(d => d.id === driverId)
                  const patch: Partial<Trip> = { driver_id: driverId }
                  if (picked?.vehicle_id) patch.vehicle_id = picked.vehicle_id
                  onUpdate(patch)
                }}
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

          {/* Inicio del viaje */}
          <div
            className={`space-y-1 pt-1 -mx-1 px-1 py-1 rounded transition-colors ${originDropOver ? 'bg-green-50 ring-1 ring-green-300' : ''}`}
            onDragOver={(e) => {
              if (!dragStopIdRef.current) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (!originDropOver) setOriginDropOver(true)
            }}
            onDragLeave={() => setOriginDropOver(false)}
            onDrop={(e) => {
              const draggedId = dragStopIdRef.current
              setOriginDropOver(false)
              if (!draggedId) return
              e.preventDefault()
              dragStopIdRef.current = null
              setDragStopId(null)
              setDropTarget(null)
              onPromoteToOrigin(draggedId)
            }}
          >
            <label className="text-[10px] text-gray-500 uppercase tracking-wide font-semibold flex items-center gap-1">
              <Flag size={10} /> Inicio del viaje
              {originDropOver && <span className="text-green-600 normal-case">— soltá para usar como inicio</span>}
            </label>
            <AddressAutocomplete
              value={originText}
              onChange={text => {
                setOriginText(text)
                if (!text.trim() && hasOrigin) {
                  onUpdate({ origin: 'Por definir', start_lat: null, start_lng: null })
                }
              }}
              onSelect={picked => {
                setOriginText(picked.label)
                onUpdate({ origin: picked.label, start_lat: picked.lat, start_lng: picked.lng })
              }}
            />
          </div>

          {/* Resumen ruta */}
          {route && (
            <div className="flex gap-2 text-xs text-gray-500">
              <span>{formatKm(route.distance_m)}</span>
              <span>·</span>
              <span>{formatDuration(route.duration_s)} total</span>
            </div>
          )}

          {/* Paradas */}
          {stops.length === 0 ? (
            <div className="text-center py-3 text-xs text-gray-400 italic">
              Sin paradas. Seleccioná del pool y asignalas.
            </div>
          ) : (
            <div className="space-y-1">
              {stops.map((s, i) => {
                const isBefore = dropTarget?.id === s.id && dropTarget.pos === 'before' && dragStopId !== s.id
                const isAfter = dropTarget?.id === s.id && dropTarget.pos === 'after' && dragStopId !== s.id
                const isBeingDragged = dragStopId === s.id
                return (
                  <div key={s.id} className="relative">
                    {isBefore && <div className="absolute left-0 right-0 -top-0.5 h-0.5 bg-blue-500 rounded-full z-10" />}
                    <div
                      draggable
                      onDragStart={(e) => {
                        dragStopIdRef.current = s.id
                        setDragStopId(s.id)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                      }}
                      onDragEnd={() => { dragStopIdRef.current = null; setDragStopId(null); setDropTarget(null) }}
                      onDragOver={(e) => {
                        const drag = dragStopIdRef.current
                        if (!drag || drag === s.id) return
                        e.preventDefault()
                        e.dataTransfer.dropEffect = 'move'
                        const rect = e.currentTarget.getBoundingClientRect()
                        const pos: 'before' | 'after' = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
                        setDropTarget(prev => (prev?.id === s.id && prev.pos === pos) ? prev : { id: s.id, pos })
                      }}
                      onDrop={(e) => { e.preventDefault(); handleStopDrop() }}
                      onMouseEnter={() => onStopHover(s.id, true)}
                      onMouseLeave={() => onStopHover(s.id, false)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded border transition-colors cursor-grab active:cursor-grabbing ${isBeingDragged ? 'opacity-40' : hoveredStopId === s.id ? 'bg-yellow-50 border-yellow-300 ring-1 ring-yellow-300' : 'bg-white border-gray-200'}`}
                    >
                      <GripVertical size={11} className="text-gray-300 shrink-0" />
                      <span
                        className="w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                        style={{ backgroundColor: pinHex(s.pin_color) }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-800 truncate">{s.alias ?? s.address.split(',')[0]}</p>
                        <div className="flex gap-1.5 items-center">
                          {stopArrivalMin[i] != null && (
                            <span className="text-[10px] text-blue-600 font-medium tabular-nums">
                              @{formatMinShort(stopArrivalMin[i]!)}
                            </span>
                          )}
                          {s.notes && <p className="text-[10px] text-gray-500 italic truncate">{s.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 text-[10px] text-gray-500" onMouseDown={e => e.stopPropagation()}>
                        <input
                          type="number"
                          min={0}
                          max={480}
                          step={1}
                          defaultValue={s.service_minutes}
                          key={`sm-${s.id}-${s.service_minutes}`}
                          onBlur={e => {
                            const v = parseInt(e.target.value, 10)
                            if (!isNaN(v) && v !== s.service_minutes) onUpdateStop(s.id, { service_minutes: v })
                          }}
                          onClick={e => e.stopPropagation()}
                          onMouseDown={e => e.stopPropagation()}
                          onDragStart={e => e.preventDefault()}
                          className="w-9 text-center bg-transparent border border-gray-200 rounded px-0.5 py-0 text-[10px] focus:outline-none focus:ring-1 focus:ring-blue-300"
                          title="Tiempo de servicio en minutos"
                          draggable={false}
                        />
                        <span>min</span>
                      </div>
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setMoveMenuStopId(moveMenuStopId === s.id ? null : s.id)}
                          title="Más opciones"
                          className="text-gray-600 hover:text-blue-600 p-0.5"
                        >
                          <MoreVertical size={12} />
                        </button>
                        {moveMenuStopId === s.id && (
                          <div className="absolute right-0 top-5 z-20 bg-white border border-gray-200 rounded-lg shadow-md py-1 min-w-[180px]">
                            <button
                              onClick={() => { onPromoteToOrigin(s.id); setMoveMenuStopId(null) }}
                              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
                            >
                              <Flag size={11} className="text-green-600" />
                              <span>Marcar como inicio</span>
                            </button>
                            {otherDrafts.length > 0 && (
                              <>
                                <div className="border-t border-gray-100 my-1" />
                                <p className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wide">Mover a:</p>
                                {otherDrafts.map(t => (
                                  <button
                                    key={t.id}
                                    onClick={() => { onMoveStop(s.id, t.id); setMoveMenuStopId(null) }}
                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
                                  >
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.line_color ?? '#6b7280' }} />
                                    <span className="truncate">{t.name ?? `Viaje del ${new Date(t.created_at).toLocaleDateString('es-AR')}`}</span>
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <button onClick={() => onReturnStop(s.id)} title="Devolver al pool"
                        className="text-gray-600 hover:text-blue-600 shrink-0">
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    {isAfter && <div className="absolute left-0 right-0 -bottom-0.5 h-0.5 bg-blue-500 rounded-full z-10" />}
                  </div>
                )
              })}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button onClick={onDelete}
              className="border border-red-200 text-red-600 hover:bg-red-50 text-xs rounded-lg py-1.5 px-3">
              Descartar
            </button>
            <button onClick={onToggle}
              className="flex-1 border border-gray-200 text-gray-700 hover:bg-white text-xs rounded-lg py-1.5">
              Guardar borrador
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
