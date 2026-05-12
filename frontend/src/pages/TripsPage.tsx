import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Route, Play, Loader2, ChevronRight, Navigation } from 'lucide-react'
import { api } from '@/lib/api'
import { captureLocation } from '@/lib/geolocation'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, Trip, Vehicle, Driver, Client } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', planificado: 'Planificado', en_curso: 'En curso', completado: 'Completado', cancelado: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  planificado: 'bg-gray-100 text-gray-600',
  en_curso: 'bg-blue-100 text-blue-700',
  completado: 'bg-green-100 text-green-700',
  cancelado: 'bg-gray-100 text-gray-400',
}

interface TF { vehicle_id: string; driver_id: string; client_id: string; associated_document: string; stops_count: string; start_odometer: string; scheduled_date: string; notes: string }
const EMPTY: TF = { vehicle_id: '', driver_id: '', client_id: '', associated_document: '', stops_count: '', start_odometer: '', scheduled_date: '', notes: '' }

interface EF { associated_document: string; notes: string; end_odometer: string }

interface CompleteModal { trip: Trip; end_odometer: string }

export default function TripsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canSeeVehicles = can('vehiculos', 'ver')
  const canSeeDrivers = can('conductores', 'ver')
  const canSeeClients = can('clientes', 'ver')
  const canEditar = can('viajes', 'editar')
  const canCerrar = can('viajes', 'cerrar')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EF>({ associated_document: '', notes: '', end_odometer: '' })
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<TF>(EMPTY)
  const [completeModal, setCompleteModal] = useState<CompleteModal | null>(null)
  const [startingId, setStartingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['trips', page],
    queryFn: () => api.get<PaginatedResponse<Trip>>(`/trips?page=${page}&size=20`).then(r => r.data),
  })

  const { data: vehicles } = useList<Vehicle>('vehicles', '/vehicles', 100, canSeeVehicles)
  const { data: drivers } = useList<Driver>('drivers', '/drivers', 100, canSeeDrivers)
  const { data: clients } = useList<Client>('clients', '/clients', 200, canSeeClients)

  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]))
  const driverMap = Object.fromEntries((drivers ?? []).map(d => [d.id, d]))
  const clientMap = Object.fromEntries((clients ?? []).map(c => [c.id, c]))

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/trips', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      setAddingRow(false); setAddForm(EMPTY)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/trips/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] }); qc.invalidateQueries({ queryKey: ['stats'] })
      setEditingId(null); setCompleteModal(null)
    },
  })

  const startMutation = useMutation({
    mutationFn: async (tripId: string) => {
      const coords = await captureLocation()
      const body = coords ? { start_lat: coords.lat, start_lng: coords.lng } : {}
      return api.post<Trip>(`/trips/${tripId}/start`, body).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['trips', 'active'] })
      qc.invalidateQueries({ queryKey: ['trips', 'pending'] })
      setStartingId(null)
      navigate('/delivery')
    },
    onError: () => setStartingId(null),
  })

  function handleStart(t: Trip) {
    if (t.scheduled_date) {
      const scheduled = new Date(t.scheduled_date)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      scheduled.setHours(0, 0, 0, 0)
      if (scheduled > today) {
        const dateStr = scheduled.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        if (!window.confirm(`Este viaje está programado para el ${dateStr}. ¿Querés iniciarlo de todas formas?`)) return
      }
    }
    setStartingId(t.id)
    startMutation.mutate(t.id)
  }

  const cancelMutation = useMutation({
    mutationFn: (tripId: string) => api.patch(`/trips/${tripId}`, { status: 'cancelado' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setCancellingId(null)
    },
    onError: () => setCancellingId(null),
  })

  function startEdit(t: Trip) {
    setAddingRow(false); setEditingId(t.id)
    setEditForm({ associated_document: t.associated_document ?? '', notes: t.notes ?? '', end_odometer: t.end_odometer?.toString() ?? '' })
  }
  function ef(k: keyof EF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof TF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    if (!completeModal) return
    updateMutation.mutate({
      id: completeModal.trip.id,
      body: { status: 'completado', end_odometer: completeModal.end_odometer ? parseInt(completeModal.end_odometer) : null },
    })
  }

  function formatDate(t: Trip): string {
    const d = t.status === 'completado'
      ? (t.end_time ?? t.start_time ?? t.scheduled_date ?? t.created_at)
      : t.status === 'en_curso'
      ? (t.start_time ?? t.scheduled_date ?? t.created_at)
      : (t.scheduled_date ?? t.created_at)
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  function dateLabel(t: Trip): string {
    if (t.status === 'completado' && t.end_time) return 'Fin'
    if (t.status === 'en_curso' && t.start_time) return 'Inicio'
    if (t.scheduled_date) return 'Programado'
    return ''
  }

  const activeVehicles = (vehicles ?? []).filter(v => v.status !== 'baja')
  const activeDrivers = (drivers ?? []).filter(d => d.status === 'activo')

  const pagination = data && data.pages > 1 && (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
      <span className="text-xs text-gray-400">Página {data.page} de {data.pages}</span>
      <div className="flex gap-2">
        <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
        <button disabled={page === data.pages} onClick={() => setPage(p => p + 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
      </div>
    </div>
  )

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Viajes</h1><p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} viajes registrados</p></div>
        <button onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }} className="hidden md:flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"><Plus size={16} /> Registrar viaje</button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Documento', 'Cliente', 'Conductor / Vehículo', 'Fecha', 'Paradas', 'Km odóm.', 'Observaciones', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-tr" onSubmit={e => {
                    e.preventDefault()
                    if (!addForm.vehicle_id) return
                    createMutation.mutate({
                      vehicle_id: addForm.vehicle_id,
                      driver_id: addForm.driver_id || null,
                      client_id: addForm.client_id || null,
                      associated_document: addForm.associated_document || null,
                      stops_count: addForm.stops_count ? parseInt(addForm.stops_count) : null,
                      start_odometer: addForm.start_odometer ? parseInt(addForm.start_odometer) : null,
                      scheduled_date: addForm.scheduled_date || null,
                      notes: addForm.notes || null,
                    })
                  }} />
                  <td className="px-3 py-2"><input form="add-tr" value={addForm.associated_document} onChange={e => af('associated_document', e.target.value)} placeholder="Nro. documento" className={CI} /></td>
                  <td className="px-3 py-2">
                    <select form="add-tr" value={addForm.client_id} onChange={e => af('client_id', e.target.value)} className={CS}>
                      <option value="">— Cliente</option>
                      {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select form="add-tr" required value={addForm.vehicle_id} onChange={e => af('vehicle_id', e.target.value)} className={CS}>
                      <option value="">— Vehículo *</option>
                      {activeVehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                    </select>
                    <select form="add-tr" value={addForm.driver_id} onChange={e => af('driver_id', e.target.value)} className={`${CS} mt-1`}>
                      <option value="">Sin conductor</option>
                      {activeDrivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2"><input form="add-tr" type="date" value={addForm.scheduled_date} onChange={e => af('scheduled_date', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-tr" type="number" min="0" value={addForm.stops_count} onChange={e => af('stops_count', e.target.value)} placeholder="Cant." className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-tr" type="number" min="0" value={addForm.start_odometer} onChange={e => af('start_odometer', e.target.value)} placeholder="Km inicial" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-tr" value={addForm.notes} onChange={e => af('notes', e.target.value)} placeholder="Observaciones" className={CI} /></td>
                  <td className="px-3 py-2 text-gray-400 text-xs">Planificado</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-tr" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow
                ? <tr><td colSpan={9} className="p-12 text-center"><Route size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay viajes registrados.</p></td></tr>
                : data?.items.map(t => {
                  const v = vehicleMap[t.vehicle_id]
                  const d = t.driver_id ? driverMap[t.driver_id] : null
                  const clientName = t.client_id ? (clientMap[t.client_id]?.name ?? '—') : '—'
                  return editingId === t.id ? (
                    <tr key={t.id} className={editRow}>
                      <form id={`e-${t.id}`} onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: t.id, body: { associated_document: editForm.associated_document || null, notes: editForm.notes || null, end_odometer: editForm.end_odometer ? parseInt(editForm.end_odometer) : null } }) }} />
                      <td className="px-3 py-2"><input form={`e-${t.id}`} value={editForm.associated_document} onChange={e => ef('associated_document', e.target.value)} placeholder="Nro. documento" className={CI} /></td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{clientName}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">
                        <div className="font-medium">{d?.full_name ?? '—'}</div>
                        <div className="font-mono text-[11px] text-gray-300">{v?.plate ?? '—'}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs">
                        <div>{formatDate(t)}</div>
                        {dateLabel(t) && <div className="text-[10px] mt-0.5">{dateLabel(t)}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs text-center">{t.stops_count ?? '—'}</td>
                      <td className="px-3 py-2"><input form={`e-${t.id}`} type="number" min="0" value={editForm.end_odometer} onChange={e => ef('end_odometer', e.target.value)} placeholder="Km final" className={CI} /></td>
                      <td className="px-3 py-2"><input form={`e-${t.id}`} value={editForm.notes} onChange={e => ef('notes', e.target.value)} placeholder="Observaciones" className={CI} /></td>
                      <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button form={`e-${t.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} className={row}>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        <Link to={`/trips/${t.id}`} className="hover:text-blue-600 transition-colors">
                          {t.associated_document ?? <span className="text-gray-400 font-normal text-xs">Sin documento</span>}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{clientName}</td>
                      <td className="px-3 py-3 text-xs">
                        <div className="text-gray-700 font-medium">{d?.full_name ?? '—'}</div>
                        <div className="font-mono text-gray-400 text-[11px] mt-0.5">{v?.plate ?? '—'}</div>
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        <div>{formatDate(t)}</div>
                        {dateLabel(t) && <div className="text-gray-400 text-[10px] mt-0.5">{dateLabel(t)}</div>}
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs text-center">{t.stops_count ?? '—'}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs font-mono">
                        {t.end_odometer ? `${t.end_odometer.toLocaleString()} km` : t.start_odometer ? `${t.start_odometer.toLocaleString()} km` : '—'}
                      </td>
                      <td className="px-3 py-3 text-gray-400 text-xs max-w-[140px] truncate" title={t.notes ?? ''}>
                        {t.notes ? (t.notes.length > 40 ? t.notes.slice(0, 40) + '…' : t.notes) : '—'}
                      </td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[t.status] ?? t.status}</span></td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {['planificado', 'pendiente'].includes(t.status) && (
                            <button
                              onClick={() => handleStart(t)}
                              disabled={startingId === t.id}
                              className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              {startingId === t.id ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              Iniciar
                            </button>
                          )}
                          {t.status === 'en_curso' && (
                            <button
                              onClick={() => navigate('/delivery')}
                              className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                            >
                              <Navigation size={12} /> Continuar
                            </button>
                          )}
                          {t.status === 'en_curso' && canCerrar && (
                            <button onClick={() => setCompleteModal({ trip: t, end_odometer: '' })} className="text-xs text-green-600 hover:text-green-800 font-medium">Finalizar</button>
                          )}
                          {['planificado', 'pendiente', 'en_curso'].includes(t.status) && canEditar && (
                            <button
                              onClick={() => { if (window.confirm('¿Cancelar este viaje?')) { setCancellingId(t.id); cancelMutation.mutate(t.id) } }}
                              disabled={cancellingId === t.id}
                              className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                            >
                              {cancellingId === t.id ? 'Cancelando…' : 'Cancelar'}
                            </button>
                          )}
                          {t.status !== 'cancelado' && canEditar && (
                            <button onClick={() => startEdit(t)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        )}
        {pagination}
      </div>

      {/* Mobile card list */}
      <div className="md:hidden mt-4">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : !data?.items.length ? (
          <div className="p-12 text-center">
            <Route size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay viajes registrados.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-200">
            {data.items.map(t => {
              const v = vehicleMap[t.vehicle_id]
              const d = t.driver_id ? driverMap[t.driver_id] : null
              return (
                <div key={t.id} className="flex items-stretch">
                  {/* Tappable left area */}
                  <Link to={`/trips/${t.id}`} className="flex-1 min-w-0 px-4 py-3.5 space-y-0.5">
                    <p className="font-semibold text-gray-900 truncate">
                      {t.associated_document ?? t.destination}
                    </p>
                    <p className="text-xs text-gray-500">
                      {v ? <span className="font-mono">{v.plate}</span> : null}
                      {v && d ? ' · ' : null}
                      {d ? d.full_name : (!v ? '—' : null)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {dateLabel(t) ? `${dateLabel(t)}: ${formatDate(t)}` : formatDate(t)}
                    </p>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </Link>
                  {/* Right side actions */}
                  <div className="shrink-0 flex flex-col gap-1.5 items-end justify-center px-3 py-3.5">
                    {['planificado', 'pendiente'].includes(t.status) && (
                      <button
                        onClick={() => handleStart(t)}
                        disabled={startingId === t.id}
                        className="flex items-center gap-1 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        {startingId === t.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <Play size={12} />
                        }
                        Iniciar
                      </button>
                    )}
                    {t.status === 'en_curso' && (
                      <button
                        onClick={() => navigate('/delivery')}
                        className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                      >
                        <Navigation size={12} /> Continuar
                      </button>
                    )}
                    {t.status === 'en_curso' && canCerrar && (
                      <button
                        onClick={() => setCompleteModal({ trip: t, end_odometer: '' })}
                        className="text-xs text-green-600 hover:text-green-800 font-medium"
                      >
                        Finalizar
                      </button>
                    )}
                    {!['planificado', 'pendiente', 'en_curso'].includes(t.status) && (
                      <ChevronRight size={16} className="text-gray-300" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {pagination}
      </div>

      {completeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Finalizar viaje</h2>
              <button onClick={() => setCompleteModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handleComplete} className="p-5 space-y-4">
              <p className="text-sm text-gray-600">{completeModal.trip.origin} → {completeModal.trip.destination}</p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Odómetro final (km)</label>
                <input type="number" min={completeModal.trip.start_odometer ?? 0} value={completeModal.end_odometer}
                  onChange={e => setCompleteModal(m => m ? { ...m, end_odometer: e.target.value } : null)}
                  placeholder={completeModal.trip.start_odometer?.toString() ?? '0'}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setCompleteModal(null)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={updateMutation.isPending} className="flex-1 text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 transition-colors">
                  {updateMutation.isPending ? 'Guardando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
