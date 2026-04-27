import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ClipboardList, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, WorkOrder, Vehicle, Machine } from '@/types'

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

const STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'abierta', label: 'Abiertas' },
  { value: 'en_progreso', label: 'En progreso' },
  { value: 'completada', label: 'Completadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

interface WF { description: string; priority: string; vehicle_id: string; machine_id: string; due_date: string }
const EMPTY: WF = { description: '', priority: 'normal', vehicle_id: '', machine_id: '', due_date: '' }

function toAddBody(f: WF) {
  return {
    description: f.description, priority: f.priority,
    vehicle_id: f.vehicle_id || null, machine_id: f.machine_id || null,
    due_date: f.due_date || null,
  }
}
function toEditBody(f: WF) {
  return { description: f.description, priority: f.priority, due_date: f.due_date || null }
}

export default function WorkOrdersPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canSeeVehicles = can('vehiculos', 'ver')
  const canSeeMachines = can('maquinas', 'ver')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<WF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<WF>(EMPTY)

  const queryKey = ['work-orders', page, statusFilter]

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), size: '20' })
      if (statusFilter) params.set('status_filter', statusFilter)
      return api.get<PaginatedResponse<WorkOrder>>(`/work-orders?${params}`).then(r => r.data)
    },
  })

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: () => api.get<PaginatedResponse<Vehicle>>('/vehicles?size=100').then(r => r.data.items),
    staleTime: 60_000,
    enabled: canSeeVehicles,
  })
  const { data: machines } = useQuery({
    queryKey: ['machines', 'all'],
    queryFn: () => api.get<PaginatedResponse<Machine>>('/machines?size=100').then(r => r.data.items),
    staleTime: 60_000,
    enabled: canSeeMachines,
  })

  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]))
  const machineMap = Object.fromEntries((machines ?? []).map(m => [m.id, m]))

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/work-orders', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] }); qc.invalidateQueries({ queryKey: ['stats'] })
      setAddingRow(false); setAddForm(EMPTY)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/work-orders/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] }); qc.invalidateQueries({ queryKey: ['stats'] })
      setEditingId(null)
    },
  })
  const closeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/work-orders/${id}/close`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); qc.invalidateQueries({ queryKey: ['stats'] }) },
  })

  function startEdit(o: WorkOrder) {
    setAddingRow(false); setEditingId(o.id)
    setEditForm({ description: o.description, priority: o.priority, vehicle_id: o.vehicle_id ?? '', machine_id: o.machine_id ?? '', due_date: o.due_date ?? '' })
  }
  function ef(k: keyof WF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof WF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Órdenes de trabajo</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} órdenes en total</p>
        </div>
        <button onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"><Plus size={16} /> Nueva orden</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button key={value} onClick={() => { setStatusFilter(value); setPage(1) }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${statusFilter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Descripción', 'Vehículo', 'Máquina', 'Prioridad', 'Estado', 'Vencimiento', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-wo" onSubmit={e => { e.preventDefault(); createMutation.mutate(toAddBody(addForm)) }} />
                  <td className="px-3 py-2"><input form="add-wo" required value={addForm.description} onChange={e => af('description', e.target.value)} placeholder="Descripción *" className={CI} /></td>
                  <td className="px-3 py-2">
                    {canSeeVehicles
                      ? <select form="add-wo" value={addForm.vehicle_id} onChange={e => { af('vehicle_id', e.target.value); if (e.target.value) af('machine_id', '') }} className={CS}>
                          <option value="">Sin vehículo</option>
                          {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                        </select>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {canSeeMachines
                      ? <select form="add-wo" value={addForm.machine_id} onChange={e => { af('machine_id', e.target.value); if (e.target.value) af('vehicle_id', '') }} className={CS}>
                          <option value="">Sin máquina</option>
                          {(machines ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <select form="add-wo" value={addForm.priority} onChange={e => af('priority', e.target.value)} className={CS}>
                      <option value="baja">Baja</option><option value="normal">Normal</option>
                      <option value="alta">Alta</option><option value="urgente">Urgente</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">Abierta</td>
                  <td className="px-3 py-2"><input form="add-wo" type="date" value={addForm.due_date} onChange={e => af('due_date', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-wo" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow
                ? <tr><td colSpan={7} className="p-12 text-center"><ClipboardList size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay órdenes de trabajo.</p></td></tr>
                : data?.items.map(o => {
                  const veh = o.vehicle_id ? vehicleMap[o.vehicle_id] : null
                  const mac = o.machine_id ? machineMap[o.machine_id] : null
                  return editingId === o.id ? (
                    <tr key={o.id} className={editRow}>
                      <form id={`e-${o.id}`} onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: o.id, body: toEditBody(editForm) }) }} />
                      <td className="px-3 py-2"><input form={`e-${o.id}`} required value={editForm.description} onChange={e => ef('description', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{veh ? `${veh.plate}` : '—'}</td>
                      <td className="px-3 py-2 text-gray-400 text-xs">{mac ? mac.name : '—'}</td>
                      <td className="px-3 py-2">
                        <select form={`e-${o.id}`} value={editForm.priority} onChange={e => ef('priority', e.target.value)} className={CS}>
                          <option value="baja">Baja</option><option value="normal">Normal</option>
                          <option value="alta">Alta</option><option value="urgente">Urgente</option>
                        </select>
                      </td>
                      <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span></td>
                      <td className="px-3 py-2"><input form={`e-${o.id}`} type="date" value={editForm.due_date} onChange={e => ef('due_date', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button form={`e-${o.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={o.id} className={row}>
                      <td className="px-3 py-3 text-gray-800 max-w-xs"><span className="line-clamp-2">{o.description}</span></td>
                      <td className="px-3 py-3 text-gray-500 font-mono text-xs">{veh ? veh.plate : '—'}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{mac ? mac.name : '—'}</td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[o.priority]}`}>{PRIORITY_LABEL[o.priority] ?? o.priority}</span></td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{o.due_date ? new Date(o.due_date).toLocaleDateString('es-AR') : '—'}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {(o.status === 'abierta' || o.status === 'en_progreso') && (
                            <button onClick={() => closeMutation.mutate(o.id)} disabled={closeMutation.isPending} title="Cerrar orden" className="text-green-600 hover:text-green-800 transition-colors">
                              <CheckCircle size={15} />
                            </button>
                          )}
                          <button onClick={() => startEdit(o)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        )}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Página {data.page} de {data.pages}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <button disabled={page === data.pages} onClick={() => setPage(p => p + 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
