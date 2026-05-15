import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ClipboardList, Check, X, Ban, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import type {
  PaginatedResponse, WorkOrder, Vehicle, Machine, Supplier, MaintenanceService,
} from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const STATUS_COLOR: Record<string, string> = {
  abierta: 'bg-amber-100 text-amber-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-gray-100 text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  abierta: 'Abierta', en_progreso: 'En progreso', completada: 'Completada', cancelada: 'Cancelada',
}
const PRIORITY_COLOR: Record<string, string> = {
  baja: 'bg-gray-100 text-gray-500', normal: 'bg-blue-100 text-blue-700',
  alta: 'bg-amber-100 text-amber-700', urgente: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
}
const APPROVAL_COLOR: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  aprobada: 'bg-green-100 text-green-700',
  rechazada: 'bg-red-100 text-red-700',
}
const APPROVAL_LABEL: Record<string, string> = {
  pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada',
}
const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'abierta', label: 'Abiertas' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'completada', label: 'Completadas' },
  { value: 'cancelada', label: 'Canceladas' },
]
const APPROVAL_FILTERS = [
  { value: '', label: 'Toda aprobación' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'rechazada', label: 'Rechazadas' },
]

interface WF {
  description: string
  priority: string
  vehicle_id: string
  machine_id: string
  scheduled_date: string
  due_date: string
}
const EMPTY: WF = { description: '', priority: 'normal', vehicle_id: '', machine_id: '', scheduled_date: '', due_date: '' }

interface CompleteForm {
  completed_date: string
  odometer_at_service: string
  cost: string
  supplier_id: string
  service_id: string
  notes: string
}

function toAddBody(f: WF) {
  return {
    description: f.description,
    priority: f.priority,
    vehicle_id: f.vehicle_id || null,
    machine_id: f.machine_id || null,
    scheduled_date: f.scheduled_date || null,
    due_date: f.due_date || null,
  }
}
function toEditBody(f: WF) {
  return {
    description: f.description,
    priority: f.priority,
    scheduled_date: f.scheduled_date || null,
    due_date: f.due_date || null,
  }
}

interface Props {
  /** Si false, no fetchea (útil para tabs). */
  enabled?: boolean
}

export default function WorkOrdersBacklog({ enabled = true }: Props) {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canCreate = can('mantenimiento', 'crear')
  const canEdit = can('mantenimiento', 'editar')
  const canClose = can('mantenimiento', 'cerrar')
  const canApprove = can('mantenimiento', 'aprobar')
  const canSeeVehicles = can('vehiculos', 'ver')
  const canSeeMachines = can('maquinas', 'ver')
  const canSeeSuppliers = can('proveedores', 'ver')

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('')
  const [showDateFilter, setShowDateFilter] = useState(false)
  const [scheduledFrom, setScheduledFrom] = useState('')
  const [scheduledTo, setScheduledTo] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<WF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<WF>(EMPTY)

  const [rejectingOrder, setRejectingOrder] = useState<WorkOrder | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [cancelingOrder, setCancelingOrder] = useState<WorkOrder | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [completingOrder, setCompletingOrder] = useState<WorkOrder | null>(null)
  const [completeForm, setCompleteForm] = useState<CompleteForm>({
    completed_date: new Date().toISOString().split('T')[0],
    odometer_at_service: '',
    cost: '',
    supplier_id: '',
    service_id: '',
    notes: '',
  })

  const { data: vehicles } = useList<Vehicle>('vehicles', '/vehicles', 100, canSeeVehicles && enabled)
  const { data: machines } = useList<Machine>('machines', '/machines', 100, canSeeMachines && enabled)
  const { data: suppliers } = useList<Supplier>('suppliers', '/suppliers', 100, canSeeSuppliers && enabled)
  const { data: maintServices } = useQuery({
    queryKey: ['maintenance-services'],
    queryFn: () => api.get<MaintenanceService[]>('/maintenance/services').then(r => r.data),
    staleTime: 60_000,
    enabled,
  })

  const queryKey = ['work-orders', page, statusFilter, approvalFilter, scheduledFrom, scheduledTo]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), size: '20' })
      if (statusFilter) p.set('status_filter', statusFilter)
      if (approvalFilter) p.set('approval_status', approvalFilter)
      if (scheduledFrom) p.set('scheduled_from', scheduledFrom)
      if (scheduledTo) p.set('scheduled_to', scheduledTo)
      return api.get<PaginatedResponse<WorkOrder>>(`/work-orders?${p}`).then(r => r.data)
    },
    enabled,
  })

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['work-orders'] })
    qc.invalidateQueries({ queryKey: ['stats'] })
  }

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/work-orders', body),
    onSuccess: () => { invalidate(); setAddingRow(false); setAddForm(EMPTY) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/work-orders/${id}`, body),
    onSuccess: () => { invalidate(); setEditingId(null) },
  })
  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/work-orders/${id}/approve`, {}),
    onSuccess: invalidate,
  })
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/work-orders/${id}/reject`, { reason }),
    onSuccess: () => { invalidate(); setRejectingOrder(null); setRejectReason('') },
  })
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/work-orders/${id}/cancel`, { reason }),
    onSuccess: () => { invalidate(); setCancelingOrder(null); setCancelReason('') },
  })
  const completeMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.post(`/work-orders/${id}/complete`, body),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['maintenance-records'] })
      setCompletingOrder(null)
    },
  })

  function startAdd() {
    setEditingId(null)
    setAddingRow(true)
    setAddForm(EMPTY)
  }
  function startEdit(o: WorkOrder) {
    setAddingRow(false)
    setEditingId(o.id)
    setEditForm({
      description: o.description,
      priority: o.priority,
      vehicle_id: o.vehicle_id ?? '',
      machine_id: o.machine_id ?? '',
      scheduled_date: o.scheduled_date ?? '',
      due_date: o.due_date ?? '',
    })
  }
  function openComplete(o: WorkOrder) {
    setCompletingOrder(o)
    setCompleteForm({
      completed_date: new Date().toISOString().split('T')[0],
      odometer_at_service: '',
      cost: '',
      supplier_id: '',
      service_id: '',
      notes: '',
    })
  }
  function submitComplete(e: React.FormEvent) {
    e.preventDefault()
    if (!completingOrder) return
    const body: Record<string, unknown> = {
      completed_date: completeForm.completed_date || null,
      odometer_at_service: completeForm.odometer_at_service ? parseInt(completeForm.odometer_at_service, 10) : null,
      cost: completeForm.cost || null,
      supplier_id: completeForm.supplier_id || null,
      service_id: completeForm.service_id || null,
      notes: completeForm.notes || null,
    }
    completeMutation.mutate({ id: completingOrder.id, body })
  }

  const ef = (k: keyof WF, v: string) => setEditForm(p => ({ ...p, [k]: v }))
  const af = (k: keyof WF, v: string) => setAddForm(p => ({ ...p, [k]: v }))
  const cf = (k: keyof CompleteForm, v: string) => setCompleteForm(p => ({ ...p, [k]: v }))

  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRowCls = 'border-b border-blue-200 bg-blue-50'
  const addRowCls = 'border-b border-green-200 bg-green-50'

  return (
    <>
      {/* Filtros */}
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setStatusFilter(value); setPage(1) }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={approvalFilter}
            onChange={e => { setApprovalFilter(e.target.value); setPage(1) }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs bg-white"
          >
            {APPROVAL_FILTERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setShowDateFilter(s => !s)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {showDateFilter ? '− Ocultar fechas' : '+ Filtrar por fecha programada'}
          </button>
          {showDateFilter && (
            <>
              <input type="date" value={scheduledFrom} onChange={e => { setScheduledFrom(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs" placeholder="Desde" />
              <span className="text-xs text-gray-400">→</span>
              <input type="date" value={scheduledTo} onChange={e => { setScheduledTo(e.target.value); setPage(1) }}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs" placeholder="Hasta" />
              {(scheduledFrom || scheduledTo) && (
                <button onClick={() => { setScheduledFrom(''); setScheduledTo(''); setPage(1) }}
                  className="text-xs text-gray-400 hover:text-gray-600">Limpiar</button>
              )}
            </>
          )}
          {canCreate && !addingRow && (
            <button onClick={startAdd}
              className="ml-auto flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors">
              <Plus size={14} /> Nueva orden
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Descripción', 'Unidad', 'Prioridad', 'Programado', 'Estado', 'Aprobación', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {addingRow && (
                  <tr className={addRowCls}>
                    <td colSpan={7} className="px-3 py-3">
                      <form
                        onSubmit={e => { e.preventDefault(); createMutation.mutate(toAddBody(addForm)) }}
                        className="flex flex-col gap-2 md:grid md:grid-cols-6 md:gap-2"
                      >
                        <input required value={addForm.description} onChange={e => af('description', e.target.value)} placeholder="Descripción *"
                          className={`${CI} md:col-span-2`} />
                        {canSeeVehicles && (
                          <select value={addForm.vehicle_id}
                            onChange={e => { af('vehicle_id', e.target.value); if (e.target.value) af('machine_id', '') }}
                            className={CS}>
                            <option value="">Sin vehículo</option>
                            {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                          </select>
                        )}
                        {canSeeMachines && (
                          <select value={addForm.machine_id}
                            onChange={e => { af('machine_id', e.target.value); if (e.target.value) af('vehicle_id', '') }}
                            className={CS}>
                            <option value="">Sin máquina</option>
                            {(machines ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        )}
                        <select value={addForm.priority} onChange={e => af('priority', e.target.value)} className={CS}>
                          <option value="baja">Baja</option><option value="normal">Normal</option>
                          <option value="alta">Alta</option><option value="urgente">Urgente</option>
                        </select>
                        <input type="date" value={addForm.scheduled_date} onChange={e => af('scheduled_date', e.target.value)}
                          className={CI} title="Fecha programada" />
                        <div className="flex gap-1 md:col-span-6">
                          <button type="submit" disabled={createMutation.isPending}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
                            Guardar
                          </button>
                          <button type="button" onClick={() => setAddingRow(false)}
                            className="text-xs border border-gray-200 px-3 py-1.5 rounded hover:bg-gray-50">
                            Cancelar
                          </button>
                          <span className="text-xs text-gray-500 ml-2 self-center">La orden quedará pendiente de aprobación.</span>
                        </div>
                      </form>
                    </td>
                  </tr>
                )}

                {data?.items.length === 0 && !addingRow ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center">
                      <ClipboardList size={32} className="text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 text-sm">No hay órdenes de trabajo.</p>
                    </td>
                  </tr>
                ) : data?.items.map(o => editingId === o.id ? (
                  <tr key={o.id} className={editRowCls}>
                    <td colSpan={7} className="px-3 py-3">
                      <form
                        onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: o.id, body: toEditBody(editForm) }) }}
                        className="flex flex-col gap-2 md:grid md:grid-cols-6 md:gap-2"
                      >
                        <input required value={editForm.description} onChange={e => ef('description', e.target.value)}
                          className={`${CI} md:col-span-3`} />
                        <select value={editForm.priority} onChange={e => ef('priority', e.target.value)} className={CS}>
                          <option value="baja">Baja</option><option value="normal">Normal</option>
                          <option value="alta">Alta</option><option value="urgente">Urgente</option>
                        </select>
                        <input type="date" value={editForm.scheduled_date} onChange={e => ef('scheduled_date', e.target.value)}
                          className={CI} title="Fecha programada" />
                        <input type="date" value={editForm.due_date} onChange={e => ef('due_date', e.target.value)}
                          className={CI} title="Fecha límite" />
                        <div className="flex gap-1 md:col-span-6">
                          <button type="submit" disabled={updateMutation.isPending}
                            className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50">
                            Guardar
                          </button>
                          <button type="button" onClick={() => setEditingId(null)}
                            className="text-xs border border-gray-200 px-3 py-1.5 rounded hover:bg-gray-50">
                            Cancelar
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                ) : (
                  <tr key={o.id} className={row}>
                    <td className="px-3 py-3 text-gray-800 max-w-xs">
                      <span className="line-clamp-2">{o.description}</span>
                      {o.approval_status === 'rechazada' && o.rejection_reason && (
                        <p className="text-[11px] text-red-600 mt-0.5 italic">Rechazada: {o.rejection_reason}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      {o.vehicle_plate ? <span className="font-mono">{o.vehicle_plate}</span>
                        : o.machine_name ? o.machine_name
                        : '—'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[o.priority]}`}>
                        {PRIORITY_LABEL[o.priority] ?? o.priority}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-600 text-xs">
                      {o.scheduled_date ? new Date(o.scheduled_date + 'T00:00').toLocaleDateString('es-AR') : '—'}
                      {o.due_date && o.due_date !== o.scheduled_date && (
                        <div className="text-[10px] text-gray-400">Límite: {new Date(o.due_date + 'T00:00').toLocaleDateString('es-AR')}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                      {o.status === 'completada' && o.completed_date && (
                        <div className="text-[10px] text-gray-400 mt-0.5">{new Date(o.completed_date + 'T00:00').toLocaleDateString('es-AR')}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${APPROVAL_COLOR[o.approval_status]}`}>
                        {APPROVAL_LABEL[o.approval_status] ?? o.approval_status}
                      </span>
                      {o.approved_by_name && o.approval_status !== 'pendiente' && (
                        <div className="text-[10px] text-gray-400 mt-0.5">por {o.approved_by_name}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {canApprove && o.approval_status === 'pendiente' && o.status !== 'completada' && o.status !== 'cancelada' && (
                          <>
                            <button
                              onClick={() => approveMutation.mutate(o.id)}
                              disabled={approveMutation.isPending}
                              title="Aprobar"
                              className="text-xs flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-2 py-1 rounded disabled:opacity-50"
                            >
                              <Check size={12} /> Aprobar
                            </button>
                            <button
                              onClick={() => { setRejectingOrder(o); setRejectReason('') }}
                              title="Rechazar"
                              className="text-xs flex items-center gap-1 border border-red-300 text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                            >
                              <X size={12} /> Rechazar
                            </button>
                          </>
                        )}
                        {canClose && o.approval_status === 'aprobada' && (o.status === 'abierta' || o.status === 'en_progreso') && (
                          <button
                            onClick={() => openComplete(o)}
                            title="Marcar como realizada"
                            className="text-xs flex items-center gap-1 bg-green-600 text-white hover:bg-green-700 px-2 py-1 rounded"
                          >
                            <Check size={12} /> Realizada
                          </button>
                        )}
                        {canEdit && (o.status === 'abierta' || o.status === 'en_progreso') && (
                          <button
                            onClick={() => { setCancelingOrder(o); setCancelReason('') }}
                            title="Cancelar"
                            className="text-xs flex items-center gap-1 border border-gray-300 text-gray-600 hover:bg-gray-50 px-2 py-1 rounded"
                          >
                            <Ban size={12} /> Cancelar
                          </button>
                        )}
                        {canEdit && (o.status === 'abierta' || o.status === 'en_progreso') && (
                          <button onClick={() => startEdit(o)}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1.5">
                            Editar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Página {data.page} de {data.pages} · {data.total} órdenes</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Anterior
              </button>
              <button disabled={page === data.pages} onClick={() => setPage(p => p + 1)}
                className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal rechazar */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Rechazar orden</h2>
              <button onClick={() => setRejectingOrder(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              rejectMutation.mutate({ id: rejectingOrder.id, reason: rejectReason })
            }}>
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-gray-700 line-clamp-2">{rejectingOrder.description}</p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">Motivo (opcional)</span>
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                    placeholder="¿Por qué se rechaza?"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                </label>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end">
                <button type="button" onClick={() => setRejectingOrder(null)}
                  className="text-sm border border-gray-300 hover:bg-white text-gray-700 font-medium px-4 py-2 rounded-lg">
                  Cancelar
                </button>
                <button type="submit" disabled={rejectMutation.isPending}
                  className="text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
                  {rejectMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Rechazar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal cancelar */}
      {cancelingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Cancelar orden</h2>
              <button onClick={() => setCancelingOrder(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={e => {
              e.preventDefault()
              cancelMutation.mutate({ id: cancelingOrder.id, reason: cancelReason })
            }}>
              <div className="px-5 py-4 space-y-3">
                <p className="text-sm text-gray-700 line-clamp-2">{cancelingOrder.description}</p>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">Motivo (opcional)</span>
                  <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={3}
                    placeholder="Se queda registrado en las notas."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-500" />
                </label>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end">
                <button type="button" onClick={() => setCancelingOrder(null)}
                  className="text-sm border border-gray-300 hover:bg-white text-gray-700 font-medium px-4 py-2 rounded-lg">
                  Volver
                </button>
                <button type="submit" disabled={cancelMutation.isPending}
                  className="text-sm bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
                  {cancelMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
                  Cancelar orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal marcar realizada */}
      {completingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900 truncate">Marcar como realizada</h2>
                <p className="text-xs text-gray-500 truncate">{completingOrder.description}</p>
              </div>
              <button onClick={() => setCompletingOrder(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitComplete}>
              <div className="px-5 py-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">Fecha realizada</span>
                  <input type="date" required value={completeForm.completed_date}
                    onChange={e => cf('completed_date', e.target.value)} className={CI} />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Km / horas <span className="text-gray-400 font-normal">(opcional)</span>
                  </span>
                  <input type="number" min={0} value={completeForm.odometer_at_service}
                    onChange={e => cf('odometer_at_service', e.target.value)} className={CI} placeholder="Ej. 125000" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Costo <span className="text-gray-400 font-normal">(opcional)</span>
                  </span>
                  <input type="number" min={0} step="0.01" value={completeForm.cost}
                    onChange={e => cf('cost', e.target.value)} className={CI} placeholder="$" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">Proveedor</span>
                  <select value={completeForm.supplier_id} onChange={e => cf('supplier_id', e.target.value)} className={CS}>
                    <option value="">— Sin proveedor</option>
                    {(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">Tipo de servicio</span>
                  <select value={completeForm.service_id} onChange={e => cf('service_id', e.target.value)} className={CS}>
                    <option value="">— Sin tipo</option>
                    {(maintServices ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-gray-700 mb-1.5 block">
                    Notas <span className="text-gray-400 font-normal">(opcional)</span>
                  </span>
                  <textarea value={completeForm.notes} onChange={e => cf('notes', e.target.value)} rows={2}
                    placeholder="Observaciones del trabajo realizado…"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </label>
                <p className="col-span-2 text-[11px] text-gray-500">
                  Al guardar se cierra la orden y se registra el trabajo en el historial de mantenimiento.
                </p>
              </div>
              <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex gap-2 justify-end">
                <button type="button" onClick={() => setCompletingOrder(null)}
                  className="text-sm border border-gray-300 hover:bg-white text-gray-700 font-medium px-4 py-2 rounded-lg">
                  Volver
                </button>
                <button type="submit" disabled={completeMutation.isPending}
                  className="text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5">
                  {completeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Guardar realizada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
