import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Plus, Trash2, GripVertical, Save, Loader2, AlertTriangle, MapPin, Clock } from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import type { LeafletMap, LeafletLayer } from '@/lib/leaflet'
import type { Driver, Trip, Vehicle } from '@/types'

interface PlannedStop {
  alias: string
  address: string
  lat: number | null
  lng: number | null
  service_minutes: number
}

interface RouteSegment {
  distance_m: number | null
  duration_s: number | null
}

interface RouteSummary {
  geometry: [number, number][]
  distance_m: number | null
  duration_s: number | null
  segments?: RouteSegment[]
}

function emptyStop(): PlannedStop {
  return { alias: '', address: '', lat: null, lng: null, service_minutes: 15 }
}

function formatKm(m: number | null): string {
  if (m == null) return '—'
  return `${(m / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} km`
}

function formatDuration(s: number | null): string {
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

  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [associatedDocument, setAssociatedDocument] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [stops, setStops] = useState<PlannedStop[]>([emptyStop(), emptyStop()])
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: drivers = [] } = useList<Driver>('drivers', '/drivers', 200, true)
  const { data: vehicles = [] } = useList<Vehicle>('vehicles', '/vehicles', 200, true)

  // Al elegir chofer, autocompletar vehículo si el chofer tiene uno asignado
  useEffect(() => {
    if (!driverId) return
    const d = drivers.find(x => x.id === driverId)
    if (d?.vehicle_id) setVehicleId(d.vehicle_id)
  }, [driverId, drivers])

  // Paradas con coords ya resueltas (descarta las que aún no tienen address geocodificado)
  const geocodedStops = useMemo(
    () => stops.filter(s => s.lat != null && s.lng != null) as Required<PlannedStop>[],
    [stops],
  )

  // Pedimos la ruta al backend cuando hay >=2 paradas con coords (debounced via deps)
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)
  const routeKey = useMemo(
    () => geocodedStops.map(s => `${s.lat?.toFixed(6)},${s.lng?.toFixed(6)}`).join('|'),
    [geocodedStops],
  )

  useEffect(() => {
    if (geocodedStops.length < 2) {
      setRouteSummary(null)
      setRouteError(null)
      return
    }
    setRouteLoading(true)
    setRouteError(null)
    let cancelled = false
    const handle = setTimeout(() => {
      api.post<RouteSummary>('/routing/route', {
        coordinates: geocodedStops.map(s => [s.lng, s.lat]),
      })
        .then(r => { if (!cancelled) setRouteSummary(r.data) })
        .catch((e: { response?: { data?: { detail?: string } } }) => {
          if (!cancelled) setRouteError(e?.response?.data?.detail ?? 'No se pudo calcular la ruta.')
        })
        .finally(() => { if (!cancelled) setRouteLoading(false) })
    }, 600)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [routeKey, geocodedStops])

  // Mapa Leaflet
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layersRef = useRef<LeafletLayer[]>([])

  useEffect(() => {
    const L = window.L
    if (!L || !mapContainerRef.current) return
    const map = L.map(mapContainerRef.current, { scrollWheelZoom: true })
    map.setView([-34.6, -58.4], 5)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map)
    mapRef.current = map
    setTimeout(() => map.invalidateSize(), 0)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // Redibujar markers y polilínea cuando cambian las paradas o la ruta
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!L || !map) return

    // Limpiar capas anteriores
    layersRef.current.forEach(l => l.remove())
    layersRef.current = []

    if (geocodedStops.length === 0) return

    // Polilínea: usar geometría real si tenemos OSRM, sino líneas rectas
    const pointsForLine: [number, number][] = routeSummary?.geometry
      ?? geocodedStops.map(s => [s.lat as number, s.lng as number])
    if (pointsForLine.length >= 2) {
      layersRef.current.push(L.polyline(pointsForLine, {
        color: '#3b82f6', weight: routeSummary?.geometry ? 4 : 3,
        opacity: routeSummary?.geometry ? 0.85 : 0.4,
        dashArray: routeSummary?.geometry ? undefined : '6 6',
      }).addTo(map))
    }

    // Markers numerados
    geocodedStops.forEach((s, i) => {
      const icon = L.divIcon({
        className: '',
        iconSize: [30, 38],
        iconAnchor: [15, 38],
        html: `<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 23 15 23s15-12 15-23C30 6.7 23.3 0 15 0z"
            fill="#3b82f6" stroke="white" stroke-width="2"/>
          <text x="15" y="20" font-family="Arial, sans-serif" font-size="13" font-weight="bold"
            fill="white" text-anchor="middle">${i + 1}</text>
        </svg>`,
      })
      layersRef.current.push(L.marker([s.lat as number, s.lng as number], { icon }).addTo(map))
    })

    // fitBounds
    const ptsForBounds: [number, number][] = geocodedStops.map(s => [s.lat as number, s.lng as number])
    if (ptsForBounds.length === 1) map.setView(ptsForBounds[0], 14)
    else if (ptsForBounds.length >= 2) map.fitBounds(L.latLngBounds(ptsForBounds), { padding: [40, 40] })
  }, [geocodedStops, routeSummary])

  // Total estimado: ruta vehicular (OSRM) + suma de service_minutes
  const totalEstimateS = useMemo(() => {
    if (!routeSummary?.duration_s) return null
    const serviceS = geocodedStops.reduce((acc, s) => acc + s.service_minutes * 60, 0)
    return routeSummary.duration_s + serviceS
  }, [routeSummary, geocodedStops])

  // ETA acumulado al ARRIBO de cada parada geocodificada (desde t=0 del viaje).
  // eta[0] = 0 (inicio); eta[i] = eta[i-1] + service(i-1) + segment(i-1->i)
  const cumulativeEtas = useMemo<(number | null)[]>(() => {
    if (geocodedStops.length === 0) return []
    const segments = routeSummary?.segments
    if (!segments || segments.length < geocodedStops.length - 1) {
      return geocodedStops.map((_, i) => i === 0 ? 0 : null)
    }
    const etas: number[] = [0]
    for (let i = 1; i < geocodedStops.length; i++) {
      const prevService = geocodedStops[i - 1].service_minutes * 60
      const legDuration = segments[i - 1]?.duration_s ?? 0
      etas.push(etas[i - 1] + prevService + legDuration)
    }
    return etas
  }, [geocodedStops, routeSummary])

  // Para mostrar el ETA al lado de cada fila del LISTADO completo (incluye filas
  // todavía sin dirección), mapeamos índice del listado → índice del geocoded.
  const etaByStopIdx = useMemo(() => {
    const result: (number | null)[] = []
    let gIdx = 0
    for (const s of stops) {
      if (s.lat != null && s.lng != null) {
        result.push(cumulativeEtas[gIdx] ?? null)
        gIdx++
      } else {
        result.push(null)
      }
    }
    return result
  }, [stops, cumulativeEtas])

  function updateStop(i: number, patch: Partial<PlannedStop>) {
    setStops(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  }
  function addStop() { setStops(prev => [...prev, emptyStop()]) }
  function removeStop(i: number) { setStops(prev => prev.filter((_, idx) => idx !== i)) }

  function handleDragStart(i: number) { setDraggingIdx(i) }
  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    if (draggingIdx === null || draggingIdx === i) return
    setStops(prev => {
      const next = [...prev]
      const [moved] = next.splice(draggingIdx, 1)
      next.splice(i, 0, moved)
      return next
    })
    setDraggingIdx(i)
  }
  function handleDragEnd() { setDraggingIdx(null) }

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post<Trip>('/trips', body).then(r => r.data),
    onSuccess: (trip) => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate(`/trips/${trip.id}`)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setSubmitError(err?.response?.data?.detail ?? 'No se pudo crear el viaje.')
    },
  })

  function handleSubmit() {
    setSubmitError(null)
    if (!vehicleId) { setSubmitError('Elegí un vehículo.'); return }
    if (geocodedStops.length < 2) {
      setSubmitError('Cargá al menos 2 paradas con dirección válida.')
      return
    }
    const origin = geocodedStops[0].alias || geocodedStops[0].address.split(',')[0]
    const destination = geocodedStops[geocodedStops.length - 1].alias || geocodedStops[geocodedStops.length - 1].address.split(',')[0]
    createMutation.mutate({
      vehicle_id: vehicleId,
      driver_id: driverId || null,
      origin,
      destination,
      associated_document: associatedDocument || null,
      scheduled_date: scheduledDate ? new Date(scheduledDate).toISOString() : null,
      stops_count: geocodedStops.length,
      planned_stops: geocodedStops.map(s => ({
        alias: s.alias || null,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        service_minutes: s.service_minutes,
      })),
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <Link to="/trips" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5">
        <ArrowLeft size={16} /> Viajes
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-1">Planificar viaje</h1>
      <p className="text-sm text-gray-500 mb-6">Definí las paradas en orden. El recorrido se calcula automáticamente.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Columna izquierda: formulario */}
        <div className="space-y-5">

          {/* Datos generales */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Datos generales</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Chofer</label>
                <select value={driverId} onChange={e => setDriverId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Sin asignar</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Vehículo *</label>
                <select required value={vehicleId} onChange={e => setVehicleId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Elegir...</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Documento asociado</label>
                <input value={associatedDocument} onChange={e => setAssociatedDocument(e.target.value)}
                  placeholder="Remito, factura..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Fecha programada</label>
                <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          {/* Lista de paradas */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Paradas en orden</h2>
              <span className="text-xs text-gray-400">{geocodedStops.length} de {stops.length} con dirección</span>
            </div>
            <div className="space-y-1.5">
              {stops.map((s, i) => {
                const eta = etaByStopIdx[i]
                const etaLabel = eta == null ? null : i === 0 ? 'Inicio' : `+${formatDuration(eta)}`
                return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={e => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-opacity ${draggingIdx === i ? 'opacity-40' : 'opacity-100'} ${s.lat != null ? 'bg-gray-50' : 'bg-amber-50/60'}`}
                >
                  <button type="button" className="cursor-grab text-gray-300 hover:text-gray-600 shrink-0">
                    <GripVertical size={14} />
                  </button>
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                    {etaLabel && (
                      <span className="text-[9px] text-gray-500 mt-0.5 whitespace-nowrap">{etaLabel}</span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={s.alias}
                    onChange={e => updateStop(i, { alias: e.target.value })}
                    placeholder="Alias"
                    className="w-20 shrink-0 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex-1 min-w-0">
                    <AddressAutocomplete
                      value={s.address}
                      onChange={text => updateStop(i, { address: text, lat: null, lng: null })}
                      onSelect={picked => updateStop(i, { address: picked.label, lat: picked.lat, lng: picked.lng })}
                      placeholder="Dirección..."
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock size={12} className="text-gray-400" />
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={s.service_minutes}
                      onChange={e => updateStop(i, { service_minutes: parseInt(e.target.value || '0') })}
                      className="w-12 border border-gray-300 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      title="Minutos en la parada"
                    />
                    <span className="text-[10px] text-gray-400">min</span>
                  </div>
                  <button type="button" onClick={() => removeStop(i)}
                    className="text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              )})}
              <button type="button" onClick={addStop}
                className="w-full border-2 border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-300 transition-colors flex items-center justify-center gap-1.5">
                <Plus size={13} /> Agregar parada
              </button>
            </div>
          </div>

          {/* Resumen + confirmar */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resumen</h2>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">Paradas</p>
                <p className="text-sm font-semibold">{geocodedStops.length}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">Distancia</p>
                <p className="text-sm font-semibold">{formatKm(routeSummary?.distance_m ?? null)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-xs text-gray-400">Duración estimada</p>
                <p className="text-sm font-semibold">{formatDuration(totalEstimateS)}</p>
              </div>
            </div>

            {routeError && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">{routeError}</p>
              </div>
            )}
            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">{submitError}</p>
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {createMutation.isPending ? 'Creando...' : 'Confirmar y crear viaje'}
            </button>
          </div>
        </div>

        {/* Columna derecha: mapa */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vista previa del recorrido</h2>
              {routeLoading && <Loader2 size={14} className="animate-spin text-blue-500" />}
            </div>
            <div ref={mapContainerRef} className="h-[400px] lg:h-[600px]" />
            {geocodedStops.length === 0 && (
              <div className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2 border-t border-gray-100">
                <MapPin size={13} />
                Cargá direcciones para ver el recorrido en el mapa.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
