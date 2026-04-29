import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wrench, ClipboardList, CheckCircle, Circle } from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, MaintenanceService, MaintenanceRecord, Vehicle, Machine, Supplier, WorkOrder, Tire } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'
const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
const editRow = 'border-b border-blue-200 bg-blue-50'
const addRow = 'border-b border-green-200 bg-green-50'

type Tab = 'records' | 'services' | 'work_orders' | 'tires'

// ── Records ────────────────────────────────────────────────────────────────
interface RF { vehicle_id: string; machine_id: string; service_id: string; supplier_id: string; service_date: string; odometer_at_service: string; cost: string }
const REC_EMPTY: RF = { vehicle_id: '', machine_id: '', service_id: '', supplier_id: '', service_date: new Date().toISOString().split('T')[0], odometer_at_service: '', cost: '' }

// ── Services ───────────────────────────────────────────────────────────────
interface SF { name: string; applies_to: string; interval_km: string; interval_days: string }
const SVC_EMPTY: SF = { name: '', applies_to: 'vehiculo', interval_km: '', interval_days: '' }
const APPLIES_LABEL: Record<string, string> = { vehiculo: 'Vehículo', maquina: 'Máquina', ambos: 'Ambos' }

// ── Work Orders ────────────────────────────────────────────────────────────
interface WF { description: string; priority: string; vehicle_id: string; machine_id: string; due_date: string }
const WO_EMPTY: WF = { description: '', priority: 'normal', vehicle_id: '', machine_id: '', due_date: '' }
const STATUS_COLOR: Record<string, string> = { abierta: 'bg-amber-100 text-amber-700', en_progreso: 'bg-blue-100 text-blue-700', completada: 'bg-green-100 text-green-700', cancelada: 'bg-gray-100 text-gray-400' }
const STATUS_LABEL: Record<string, string> = { abierta: 'Abierta', en_progreso: 'En progreso', completada: 'Completada', cancelada: 'Cancelada' }
const PRIORITY_COLOR: Record<string, string> = { baja: 'bg-gray-100 text-gray-500', normal: 'bg-blue-100 text-blue-700', alta: 'bg-amber-100 text-amber-700', urgente: 'bg-red-100 text-red-700' }
const PRIORITY_LABEL: Record<string, string> = { baja: 'Baja', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' }
const STATUS_FILTERS = [{ value: '', label: 'Todas' }, { value: 'abierta', label: 'Abiertas' }, { value: 'en_progreso', label: 'En progreso' }, { value: 'completada', label: 'Completadas' }, { value: 'cancelada', label: 'Canceladas' }]

// ── Tires ──────────────────────────────────────────────────────────────────
interface TF { position: string; axle: string; brand: string; model: string; size: string; serial_number: string; km_at_install: string; km_limit: string }
const TIRE_EMPTY: TF = { position: '', axle: '', brand: '', model: '', size: '', serial_number: '', km_at_install: '0', km_limit: '' }
interface EF { position: string; brand: string; model: string; size: string; serial_number: string; km_limit: string; status: string }
const TIRE_STATUS_COLOR: Record<string, string> = { en_uso: 'bg-green-100 text-green-700', en_stock: 'bg-blue-100 text-blue-700', reencauchado: 'bg-amber-100 text-amber-700', descartado: 'bg-gray-100 text-gray-400' }
const TIRE_STATUS_LABEL: Record<string, string> = { en_uso: 'En uso', en_stock: 'En stock', reencauchado: 'Reencauchado', descartado: 'Descartado' }

function KmBar({ current, limit }: { current: number; limit: number | null }) {
  if (!limit) return <span className="text-gray-400 text-xs">Sin límite</span>
  const pct = Math.min((current / limit) * 100, 100)
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 shrink-0">{Math.round(pct)}%</span>
    </div>
  )
}

export default function MaintenancePage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canSeeMachines = can('maquinas', 'ver')
  const canSeeVehicles = can('vehiculos', 'ver')
  const canSeeSuppliers = can('proveedores', 'ver')
  const canSeeWorkOrders = can('ordenes_trabajo', 'ver')
  const canCreateWorkOrders = can('ordenes_trabajo', 'crear')
  const canSeeTires = can('neumaticos', 'ver')
  const canCreateTires = can('neumaticos', 'crear')

  const [tab, setTab] = useState<Tab>('records')

  // Records state
  const [recordPage, setRecordPage] = useState(1)
  const [recEditingId, setRecEditingId] = useState<string | null>(null)
  const [recEditForm, setRecEditForm] = useState<RF>(REC_EMPTY)
  const [recAddingRow, setRecAddingRow] = useState(false)
  const [recAddForm, setRecAddForm] = useState<RF>(REC_EMPTY)

  // Services state
  const [svcEditingId, setSvcEditingId] = useState<string | null>(null)
  const [svcEditForm, setSvcEditForm] = useState<SF>(SVC_EMPTY)
  const [svcAddingRow, setSvcAddingRow] = useState(false)
  const [svcAddForm, setSvcAddForm] = useState<SF>(SVC_EMPTY)

  // Work orders state
  const [woPage, setWoPage] = useState(1)
  const [woStatusFilter, setWoStatusFilter] = useState('')
  const [woEditingId, setWoEditingId] = useState<string | null>(null)
  const [woEditForm, setWoEditForm] = useState<WF>(WO_EMPTY)
  const [woAddingRow, setWoAddingRow] = useState(false)
  const [woAddForm, setWoAddForm] = useState<WF>(WO_EMPTY)

  // Tires state
  const [tiresVehicleId, setTiresVehicleId] = useState('')
  const [tiresEditingId, setTiresEditingId] = useState<string | null>(null)
  const [tiresEditForm, setTiresEditForm] = useState<EF>({ position: '', brand: '', model: '', size: '', serial_number: '', km_limit: '', status: 'en_uso' })
  const [tiresAddingRow, setTiresAddingRow] = useState(false)
  const [tiresAddForm, setTiresAddForm] = useState<TF>(TIRE_EMPTY)

  // Shared data
  const { data: vehicles } = useList<Vehicle>('vehicles', '/vehicles', 100, canSeeVehicles)
  const { data: machines } = useList<Machine>('machines', '/machines', 100, canSeeMachines)
  const { data: suppliers } = useList<Supplier>('suppliers', '/suppliers', 100, canSeeSuppliers)
  const { data: allServices } = useQuery({
    queryKey: ['maintenance-services'],
    queryFn: () => api.get<MaintenanceService[]>('/maintenance/services').then(r => r.data),
    staleTime: 60_000,
  })

  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]))
  const machineMap = Object.fromEntries((machines ?? []).map(m => [m.id, m]))
  const supplierMap = Object.fromEntries((suppliers ?? []).map(s => [s.id, s]))
  const serviceMap = Object.fromEntries((allServices ?? []).map(s => [s.id, s]))

  // Records query
  const { data: records, isLoading: loadingRecords } = useQuery({
    queryKey: ['maintenance-records', recordPage],
    queryFn: () => api.get<PaginatedResponse<MaintenanceRecord>>(`/maintenance/records?page=${recordPage}&size=20`).then(r => r.data),
    enabled: tab === 'records',
  })

  // Services query
  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['maintenance-services'],
    queryFn: () => api.get<MaintenanceService[]>('/maintenance/services').then(r => r.data),
    enabled: tab === 'services',
  })

  // Work orders query
  const { data: workOrders, isLoading: loadingWo } = useQuery({
    queryKey: ['work-orders', woPage, woStatusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(woPage), size: '20' })
      if (woStatusFilter) params.set('status_filter', woStatusFilter)
      return api.get<PaginatedResponse<WorkOrder>>(`/work-orders?${params}`).then(r => r.data)
    },
    enabled: tab === 'work_orders' && canSeeWorkOrders,
  })

  // Tires query
  const { data: tires, isLoading: loadingTires } = useQuery({
    queryKey: ['tires', tiresVehicleId],
    queryFn: () => api.get<Tire[]>(`/tires/vehicle/${tiresVehicleId}`).then(r => r.data),
    enabled: tab === 'tires' && !!tiresVehicleId,
  })

  // Records mutations
  const createRecord = useMutation({ mutationFn: (b: object) => api.post('/maintenance/records', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-records'] }); setRecAddingRow(false); setRecAddForm(REC_EMPTY) } })
  const updateRecord = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/maintenance/records/${id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-records'] }); setRecEditingId(null) } })

  // Services mutations
  const createService = useMutation({ mutationFn: (b: object) => api.post('/maintenance/services', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-services'] }); setSvcAddingRow(false); setSvcAddForm(SVC_EMPTY) } })
  const updateService = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/maintenance/services/${id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-services'] }); setSvcEditingId(null) } })

  // Work orders mutations
  const createWo = useMutation({ mutationFn: (b: object) => api.post('/work-orders', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); qc.invalidateQueries({ queryKey: ['stats'] }); setWoAddingRow(false); setWoAddForm(WO_EMPTY) } })
  const updateWo = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/work-orders/${id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); setWoEditingId(null) } })
  const closeWo = useMutation({ mutationFn: (id: string) => api.post(`/work-orders/${id}/close`, {}), onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); qc.invalidateQueries({ queryKey: ['stats'] }) } })

  // Tires mutations
  const createTire = useMutation({ mutationFn: (b: object) => api.post('/tires', b), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tires', tiresVehicleId] }); setTiresAddingRow(false); setTiresAddForm(TIRE_EMPTY) } })
  const updateTire = useMutation({ mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/tires/${id}`, body), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tires', tiresVehicleId] }); setTiresEditingId(null) } })

  function recBody(f: RF) { return { vehicle_id: f.vehicle_id || null, machine_id: f.machine_id || null, service_id: f.service_id || null, supplier_id: f.supplier_id || null, service_date: f.service_date, odometer_at_service: f.odometer_at_service ? parseInt(f.odometer_at_service) : null, cost: f.cost || null } }
  function svcBody(f: SF) { return { name: f.name, applies_to: f.applies_to, interval_km: f.interval_km ? parseInt(f.interval_km) : null, interval_days: f.interval_days ? parseInt(f.interval_days) : null } }
  function woAddBody(f: WF) { return { description: f.description, priority: f.priority, vehicle_id: f.vehicle_id || null, machine_id: f.machine_id || null, due_date: f.due_date || null } }
  function woEditBody(f: WF) { return { description: f.description, priority: f.priority, due_date: f.due_date || null } }

  function ref(k: keyof RF, v: string) { setRecEditForm(p => ({ ...p, [k]: v })) }
  function raf(k: keyof RF, v: string) { setRecAddForm(p => ({ ...p, [k]: v })) }
  function sef(k: keyof SF, v: string) { setSvcEditForm(p => ({ ...p, [k]: v })) }
  function saf(k: keyof SF, v: string) { setSvcAddForm(p => ({ ...p, [k]: v })) }
  function wef(k: keyof WF, v: string) { setWoEditForm(p => ({ ...p, [k]: v })) }
  function waf(k: keyof WF, v: string) { setWoAddForm(p => ({ ...p, [k]: v })) }
  function tef(k: keyof EF, v: string) { setTiresEditForm(p => ({ ...p, [k]: v })) }
  function taf(k: keyof TF, v: string) { setTiresAddForm(p => ({ ...p, [k]: v })) }

  const selectedVehicle = vehicles?.find(v => v.id === tiresVehicleId)
  const alertTires = tires?.filter(t => t.km_limit && t.current_km >= t.km_limit * 0.9 && t.status === 'en_uso') ?? []

  const addLabel: Record<Tab, string | null> = {
    records: 'Registrar servicio',
    services: 'Agregar tipo',
    work_orders: canCreateWorkOrders ? 'Nueva orden' : null,
    tires: (canCreateTires && !!tiresVehicleId) ? 'Agregar neumático' : null,
  }

  function handleAdd() {
    if (tab === 'records') { setRecAddingRow(true); setRecEditingId(null); setRecAddForm(REC_EMPTY) }
    else if (tab === 'services') { setSvcAddingRow(true); setSvcEditingId(null); setSvcAddForm(SVC_EMPTY) }
    else if (tab === 'work_orders') { setWoAddingRow(true); setWoEditingId(null); setWoAddForm(WO_EMPTY) }
    else if (tab === 'tires') { setTiresAddingRow(true); setTiresEditingId(null); setTiresAddForm(TIRE_EMPTY) }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mantenimiento</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historial, órdenes de trabajo y neumáticos</p>
        </div>
        {addLabel[tab] && (
          <button onClick={handleAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={16} /> {addLabel[tab]}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto">
        {tabBtn('records', 'Historial')}
        {tabBtn('services', 'Tipos de servicio')}
        {canSeeWorkOrders && tabBtn('work_orders', 'Órdenes de trabajo')}
        {canSeeTires && tabBtn('tires', 'Neumáticos')}
      </div>

      {/* ── Historial ─────────────────────────────────────────────── */}
      {tab === 'records' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingRecords ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Fecha', 'Vehículo / Máquina', 'Servicio', 'Km / Horas', 'Proveedor', 'Costo', ''].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recAddingRow && (
                  <tr className={addRow}>
                    <form id="add-rec" onSubmit={e => { e.preventDefault(); createRecord.mutate(recBody(recAddForm)) }} />
                    <td className="px-3 py-2"><input form="add-rec" required type="date" value={recAddForm.service_date} onChange={e => raf('service_date', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        {canSeeVehicles && <select form="add-rec" value={recAddForm.vehicle_id} onChange={e => { raf('vehicle_id', e.target.value); if (e.target.value) raf('machine_id', '') }} className={CS}><option value="">— Vehículo</option>{(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plate} {v.brand} {v.model}</option>)}</select>}
                        {canSeeMachines && <select form="add-rec" value={recAddForm.machine_id} onChange={e => { raf('machine_id', e.target.value); if (e.target.value) raf('vehicle_id', '') }} className={CS}><option value="">— Máquina</option>{(machines ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
                      </div>
                    </td>
                    <td className="px-3 py-2"><select form="add-rec" value={recAddForm.service_id} onChange={e => raf('service_id', e.target.value)} className={CS}><option value="">— Tipo</option>{(allServices ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td className="px-3 py-2"><input form="add-rec" type="number" min="0" value={recAddForm.odometer_at_service} onChange={e => raf('odometer_at_service', e.target.value)} placeholder="Km / h" className={CI} /></td>
                    <td className="px-3 py-2"><select form="add-rec" value={recAddForm.supplier_id} onChange={e => raf('supplier_id', e.target.value)} className={CS}><option value="">— Proveedor</option>{(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td className="px-3 py-2"><input form="add-rec" type="number" min="0" step="0.01" value={recAddForm.cost} onChange={e => raf('cost', e.target.value)} placeholder="$" className={CI} /></td>
                    <td className="px-3 py-2"><div className="flex gap-1"><button form="add-rec" type="submit" disabled={createRecord.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setRecAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                  </tr>
                )}
                {records?.items.length === 0 && !recAddingRow
                  ? <tr><td colSpan={7} className="p-12 text-center"><ClipboardList size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay registros de mantenimiento.</p></td></tr>
                  : records?.items.map(r => {
                    const v = r.vehicle_id ? vehicleMap[r.vehicle_id] : null
                    const m = r.machine_id ? machineMap[r.machine_id] : null
                    const s = r.service_id ? serviceMap[r.service_id] : null
                    const sup = r.supplier_id ? supplierMap[r.supplier_id] : null
                    const unit = v ? `${v.plate} — ${v.brand} ${v.model}` : m ? m.name : '—'
                    return recEditingId === r.id ? (
                      <tr key={r.id} className={editRow}>
                        <form id={`er-${r.id}`} onSubmit={e => { e.preventDefault(); updateRecord.mutate({ id: r.id, body: recBody(recEditForm) }) }} />
                        <td className="px-3 py-2"><input form={`er-${r.id}`} required type="date" value={recEditForm.service_date} onChange={e => ref('service_date', e.target.value)} className={CI} /></td>
                        <td className="px-3 py-2"><div className="flex flex-col gap-1">{canSeeVehicles && <select form={`er-${r.id}`} value={recEditForm.vehicle_id} onChange={e => { ref('vehicle_id', e.target.value); if (e.target.value) ref('machine_id', '') }} className={CS}><option value="">— Vehículo</option>{(vehicles ?? []).map(v2 => <option key={v2.id} value={v2.id}>{v2.plate} {v2.brand} {v2.model}</option>)}</select>}{canSeeMachines && <select form={`er-${r.id}`} value={recEditForm.machine_id} onChange={e => { ref('machine_id', e.target.value); if (e.target.value) ref('vehicle_id', '') }} className={CS}><option value="">— Máquina</option>{(machines ?? []).map(m2 => <option key={m2.id} value={m2.id}>{m2.name}</option>)}</select>}</div></td>
                        <td className="px-3 py-2"><select form={`er-${r.id}`} value={recEditForm.service_id} onChange={e => ref('service_id', e.target.value)} className={CS}><option value="">— Tipo</option>{(allServices ?? []).map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select></td>
                        <td className="px-3 py-2"><input form={`er-${r.id}`} type="number" min="0" value={recEditForm.odometer_at_service} onChange={e => ref('odometer_at_service', e.target.value)} className={CI} /></td>
                        <td className="px-3 py-2"><select form={`er-${r.id}`} value={recEditForm.supplier_id} onChange={e => ref('supplier_id', e.target.value)} className={CS}><option value="">— Proveedor</option>{(suppliers ?? []).map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}</select></td>
                        <td className="px-3 py-2"><input form={`er-${r.id}`} type="number" min="0" step="0.01" value={recEditForm.cost} onChange={e => ref('cost', e.target.value)} className={CI} /></td>
                        <td className="px-3 py-2"><div className="flex gap-1"><button form={`er-${r.id}`} type="submit" disabled={updateRecord.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setRecEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                      </tr>
                    ) : (
                      <tr key={r.id} className={row}>
                        <td className="px-3 py-3 text-gray-700">{r.service_date}</td>
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-gray-800">{unit}</td>
                        <td className="px-3 py-3 text-gray-700">{s?.name ?? <span className="text-gray-400 text-xs">Sin tipo</span>}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{r.odometer_at_service?.toLocaleString('es-AR') ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-500">{sup?.name ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-700">{r.cost ? `$ ${parseFloat(r.cost).toLocaleString('es-AR')}` : '—'}</td>
                        <td className="px-3 py-3 text-right"><button onClick={() => { setRecAddingRow(false); setRecEditingId(r.id); setRecEditForm({ vehicle_id: r.vehicle_id ?? '', machine_id: r.machine_id ?? '', service_id: r.service_id ?? '', supplier_id: r.supplier_id ?? '', service_date: r.service_date, odometer_at_service: r.odometer_at_service?.toString() ?? '', cost: r.cost ?? '' }) }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          )}
          {records && records.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <span className="text-xs text-gray-400">Página {records.page} de {records.pages}</span>
              <div className="flex gap-2">
                <button disabled={recordPage === 1} onClick={() => setRecordPage(p => p - 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                <button disabled={recordPage === records.pages} onClick={() => setRecordPage(p => p + 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tipos de servicio ──────────────────────────────────────── */}
      {tab === 'services' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingServices ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Nombre', 'Aplica a', 'Intervalo km', 'Intervalo días', ''].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {svcAddingRow && (
                  <tr className={addRow}>
                    <form id="add-svc" onSubmit={e => { e.preventDefault(); createService.mutate(svcBody(svcAddForm)) }} />
                    <td className="px-3 py-2"><input form="add-svc" required value={svcAddForm.name} onChange={e => saf('name', e.target.value)} placeholder="Cambio de aceite *" className={CI} /></td>
                    <td className="px-3 py-2"><select form="add-svc" value={svcAddForm.applies_to} onChange={e => saf('applies_to', e.target.value)} className={CS}><option value="vehiculo">Vehículo</option><option value="maquina">Máquina</option><option value="ambos">Ambos</option></select></td>
                    <td className="px-3 py-2"><input form="add-svc" type="number" min="0" value={svcAddForm.interval_km} onChange={e => saf('interval_km', e.target.value)} placeholder="10000" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-svc" type="number" min="0" value={svcAddForm.interval_days} onChange={e => saf('interval_days', e.target.value)} placeholder="365" className={CI} /></td>
                    <td className="px-3 py-2"><div className="flex gap-1"><button form="add-svc" type="submit" disabled={createService.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setSvcAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                  </tr>
                )}
                {(!services || services.length === 0) && !svcAddingRow
                  ? <tr><td colSpan={5} className="p-12 text-center"><Wrench size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay tipos de servicio configurados.</p></td></tr>
                  : services?.map(s => svcEditingId === s.id ? (
                    <tr key={s.id} className={editRow}>
                      <form id={`es-${s.id}`} onSubmit={e => { e.preventDefault(); updateService.mutate({ id: s.id, body: svcBody(svcEditForm) }) }} />
                      <td className="px-3 py-2"><input form={`es-${s.id}`} required value={svcEditForm.name} onChange={e => sef('name', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2"><select form={`es-${s.id}`} value={svcEditForm.applies_to} onChange={e => sef('applies_to', e.target.value)} className={CS}><option value="vehiculo">Vehículo</option><option value="maquina">Máquina</option><option value="ambos">Ambos</option></select></td>
                      <td className="px-3 py-2"><input form={`es-${s.id}`} type="number" min="0" value={svcEditForm.interval_km} onChange={e => sef('interval_km', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2"><input form={`es-${s.id}`} type="number" min="0" value={svcEditForm.interval_days} onChange={e => sef('interval_days', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2"><div className="flex gap-1"><button form={`es-${s.id}`} type="submit" disabled={updateService.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setSvcEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                    </tr>
                  ) : (
                    <tr key={s.id} className={row}>
                      <td className="px-3 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{APPLIES_LABEL[s.applies_to] ?? s.applies_to}</td>
                      <td className="px-3 py-3 text-gray-500">{s.interval_km ? `${s.interval_km.toLocaleString('es-AR')} km` : '—'}</td>
                      <td className="px-3 py-3 text-gray-500">{s.interval_days ? `${s.interval_days} días` : '—'}</td>
                      <td className="px-3 py-3 text-right"><button onClick={() => { setSvcAddingRow(false); setSvcEditingId(s.id); setSvcEditForm({ name: s.name, applies_to: s.applies_to, interval_km: s.interval_km?.toString() ?? '', interval_days: s.interval_days?.toString() ?? '' }) }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Órdenes de trabajo ─────────────────────────────────────── */}
      {tab === 'work_orders' && canSeeWorkOrders && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            {STATUS_FILTERS.map(({ value, label }) => (
              <button key={value} onClick={() => { setWoStatusFilter(value); setWoPage(1) }}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${woStatusFilter === value ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {loadingWo ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Descripción', 'Vehículo', 'Máquina', 'Prioridad', 'Estado', 'Vencimiento', ''].map(h => (
                      <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {woAddingRow && (
                    <tr className={addRow}>
                      <form id="add-wo" onSubmit={e => { e.preventDefault(); createWo.mutate(woAddBody(woAddForm)) }} />
                      <td className="px-3 py-2"><input form="add-wo" required value={woAddForm.description} onChange={e => waf('description', e.target.value)} placeholder="Descripción *" className={CI} /></td>
                      <td className="px-3 py-2">{canSeeVehicles ? <select form="add-wo" value={woAddForm.vehicle_id} onChange={e => { waf('vehicle_id', e.target.value); if (e.target.value) waf('machine_id', '') }} className={CS}><option value="">Sin vehículo</option>{(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}</select> : <span className="text-gray-300 text-xs">—</span>}</td>
                      <td className="px-3 py-2">{canSeeMachines ? <select form="add-wo" value={woAddForm.machine_id} onChange={e => { waf('machine_id', e.target.value); if (e.target.value) waf('vehicle_id', '') }} className={CS}><option value="">Sin máquina</option>{(machines ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select> : <span className="text-gray-300 text-xs">—</span>}</td>
                      <td className="px-3 py-2"><select form="add-wo" value={woAddForm.priority} onChange={e => waf('priority', e.target.value)} className={CS}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></td>
                      <td className="px-3 py-2 text-gray-400 text-xs">Abierta</td>
                      <td className="px-3 py-2"><input form="add-wo" type="date" value={woAddForm.due_date} onChange={e => waf('due_date', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2"><div className="flex gap-1"><button form="add-wo" type="submit" disabled={createWo.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setWoAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                    </tr>
                  )}
                  {workOrders?.items.length === 0 && !woAddingRow
                    ? <tr><td colSpan={7} className="p-12 text-center"><ClipboardList size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay órdenes de trabajo.</p></td></tr>
                    : workOrders?.items.map(o => {
                      const veh = o.vehicle_id ? vehicleMap[o.vehicle_id] : null
                      const mac = o.machine_id ? machineMap[o.machine_id] : null
                      return woEditingId === o.id ? (
                        <tr key={o.id} className={editRow}>
                          <form id={`ewo-${o.id}`} onSubmit={e => { e.preventDefault(); updateWo.mutate({ id: o.id, body: woEditBody(woEditForm) }) }} />
                          <td className="px-3 py-2"><input form={`ewo-${o.id}`} required value={woEditForm.description} onChange={e => wef('description', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{veh ? veh.plate : '—'}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{mac ? mac.name : '—'}</td>
                          <td className="px-3 py-2"><select form={`ewo-${o.id}`} value={woEditForm.priority} onChange={e => wef('priority', e.target.value)} className={CS}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></td>
                          <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</span></td>
                          <td className="px-3 py-2"><input form={`ewo-${o.id}`} type="date" value={woEditForm.due_date} onChange={e => wef('due_date', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2"><div className="flex gap-1"><button form={`ewo-${o.id}`} type="submit" disabled={updateWo.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setWoEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                        </tr>
                      ) : (
                        <tr key={o.id} className={row}>
                          <td className="px-3 py-3 text-gray-800 max-w-xs"><span className="line-clamp-2">{o.description}</span></td>
                          <td className="px-3 py-3 text-gray-500 font-mono text-xs">{veh ? veh.plate : '—'}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{mac ? mac.name : '—'}</td>
                          <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[o.priority]}`}>{PRIORITY_LABEL[o.priority] ?? o.priority}</span></td>
                          <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{o.due_date ? new Date(o.due_date).toLocaleDateString('es-AR') : '—'}</td>
                          <td className="px-3 py-3"><div className="flex items-center justify-end gap-2">{(o.status === 'abierta' || o.status === 'en_progreso') && <button onClick={() => closeWo.mutate(o.id)} disabled={closeWo.isPending} title="Cerrar orden" className="text-green-600 hover:text-green-800 transition-colors"><CheckCircle size={15} /></button>}<button onClick={() => { setWoAddingRow(false); setWoEditingId(o.id); setWoEditForm({ description: o.description, priority: o.priority, vehicle_id: o.vehicle_id ?? '', machine_id: o.machine_id ?? '', due_date: o.due_date ?? '' }) }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></div></td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            )}
            {workOrders && workOrders.pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">Página {workOrders.page} de {workOrders.pages}</span>
                <div className="flex gap-2">
                  <button disabled={woPage === 1} onClick={() => setWoPage(p => p - 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                  <button disabled={woPage === workOrders.pages} onClick={() => setWoPage(p => p + 1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Neumáticos ─────────────────────────────────────────────── */}
      {tab === 'tires' && canSeeTires && (
        <>
          <div className="mb-5">
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Seleccionar vehículo</label>
            <select value={tiresVehicleId} onChange={e => { setTiresVehicleId(e.target.value); setTiresAddingRow(false); setTiresEditingId(null) }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px]">
              <option value="">— Elegir vehículo —</option>
              {vehicles?.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
            </select>
          </div>

          {!tiresVehicleId ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
              Seleccioná un vehículo para ver sus neumáticos.
            </div>
          ) : loadingTires ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Cargando...</div>
          ) : (
            <>
              {alertTires.length > 0 && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <p className="text-sm font-medium text-red-700">{alertTires.length === 1 ? '1 neumático cerca o superando el límite de km:' : `${alertTires.length} neumáticos cerca o superando el límite de km:`}</p>
                  <p className="text-xs text-red-600 mt-0.5">{alertTires.map(t => t.position).join(', ')}</p>
                </div>
              )}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">{selectedVehicle?.plate} — {selectedVehicle?.brand} {selectedVehicle?.model}<span className="text-gray-400 ml-2 font-normal">{tires?.length ?? 0} neumáticos registrados</span></p>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Posición', 'Marca', 'Modelo', 'Medida', 'N° Serie', 'Km inst.', 'Km límite', 'Progreso', 'Estado', ''].map(h => (
                        <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tiresAddingRow && (
                      <tr className={addRow}>
                        <form id="add-tire" onSubmit={e => { e.preventDefault(); createTire.mutate({ vehicle_id: tiresVehicleId, position: tiresAddForm.position, axle: tiresAddForm.axle ? parseInt(tiresAddForm.axle) : null, brand: tiresAddForm.brand || null, model: tiresAddForm.model || null, size: tiresAddForm.size || null, serial_number: tiresAddForm.serial_number || null, km_at_install: parseInt(tiresAddForm.km_at_install) || 0, km_limit: tiresAddForm.km_limit ? parseInt(tiresAddForm.km_limit) : null }) }} />
                        <td className="px-3 py-2"><input form="add-tire" required value={tiresAddForm.position} onChange={e => taf('position', e.target.value)} placeholder="eje1_izq *" className={CI} /></td>
                        <td className="px-3 py-2"><input form="add-tire" value={tiresAddForm.brand} onChange={e => taf('brand', e.target.value)} placeholder="Bridgestone" className={CI} /></td>
                        <td className="px-3 py-2"><input form="add-tire" value={tiresAddForm.model} onChange={e => taf('model', e.target.value)} placeholder="R295" className={CI} /></td>
                        <td className="px-3 py-2"><input form="add-tire" value={tiresAddForm.size} onChange={e => taf('size', e.target.value)} placeholder="295/80 R22.5" className={CI} /></td>
                        <td className="px-3 py-2"><input form="add-tire" value={tiresAddForm.serial_number} onChange={e => taf('serial_number', e.target.value)} placeholder="SN-123" className={CI} /></td>
                        <td className="px-3 py-2"><input form="add-tire" type="number" min="0" value={tiresAddForm.km_at_install} onChange={e => taf('km_at_install', e.target.value)} className={CI} /></td>
                        <td className="px-3 py-2"><input form="add-tire" type="number" min="0" value={tiresAddForm.km_limit} onChange={e => taf('km_limit', e.target.value)} placeholder="80000" className={CI} /></td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-gray-400 text-xs">En uso</td>
                        <td className="px-3 py-2"><div className="flex gap-1"><button form="add-tire" type="submit" disabled={createTire.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setTiresAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                      </tr>
                    )}
                    {!tires || (tires.length === 0 && !tiresAddingRow)
                      ? <tr><td colSpan={10} className="p-12 text-center"><Circle size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay neumáticos registrados para este vehículo.</p>{canCreateTires && <button onClick={() => setTiresAddingRow(true)} className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium">Agregar el primero</button>}</td></tr>
                      : tires?.map(tire => tiresEditingId === tire.id ? (
                        <tr key={tire.id} className={editRow}>
                          <form id={`et-${tire.id}`} onSubmit={e => { e.preventDefault(); updateTire.mutate({ id: tire.id, body: { position: tiresEditForm.position, brand: tiresEditForm.brand || null, model: tiresEditForm.model || null, size: tiresEditForm.size || null, serial_number: tiresEditForm.serial_number || null, km_limit: tiresEditForm.km_limit ? parseInt(tiresEditForm.km_limit) : null, status: tiresEditForm.status } }) }} />
                          <td className="px-3 py-2"><input form={`et-${tire.id}`} required value={tiresEditForm.position} onChange={e => tef('position', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2"><input form={`et-${tire.id}`} value={tiresEditForm.brand} onChange={e => tef('brand', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2"><input form={`et-${tire.id}`} value={tiresEditForm.model} onChange={e => tef('model', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2"><input form={`et-${tire.id}`} value={tiresEditForm.size} onChange={e => tef('size', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2"><input form={`et-${tire.id}`} value={tiresEditForm.serial_number} onChange={e => tef('serial_number', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{tire.km_at_install.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2"><input form={`et-${tire.id}`} type="number" min="0" value={tiresEditForm.km_limit} onChange={e => tef('km_limit', e.target.value)} className={CI} /></td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2"><select form={`et-${tire.id}`} value={tiresEditForm.status} onChange={e => tef('status', e.target.value)} className={CS}><option value="en_uso">En uso</option><option value="en_stock">En stock</option><option value="reencauchado">Reencauchado</option><option value="descartado">Descartado</option></select></td>
                          <td className="px-3 py-2"><div className="flex gap-1"><button form={`et-${tire.id}`} type="submit" disabled={updateTire.isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setTiresEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                        </tr>
                      ) : (
                        <tr key={tire.id} className={row}>
                          <td className="px-3 py-3 font-mono text-gray-900 text-xs">{tire.position}</td>
                          <td className="px-3 py-3 text-gray-700">{tire.brand ?? '—'}</td>
                          <td className="px-3 py-3 text-gray-700">{tire.model ?? '—'}</td>
                          <td className="px-3 py-3 text-gray-400 text-xs">{tire.size ?? '—'}</td>
                          <td className="px-3 py-3 text-gray-400 text-xs font-mono">{tire.serial_number ?? '—'}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{tire.km_at_install.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-3 text-gray-500 text-xs">{tire.km_limit ? tire.km_limit.toLocaleString('es-AR') : '—'}</td>
                          <td className="px-3 py-3"><KmBar current={tire.current_km} limit={tire.km_limit} /></td>
                          <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIRE_STATUS_COLOR[tire.status]}`}>{TIRE_STATUS_LABEL[tire.status] ?? tire.status}</span></td>
                          <td className="px-3 py-3 text-right"><button onClick={() => { setTiresAddingRow(false); setTiresEditingId(tire.id); setTiresEditForm({ position: tire.position, brand: tire.brand ?? '', model: tire.model ?? '', size: tire.size ?? '', serial_number: tire.serial_number ?? '', km_limit: tire.km_limit?.toString() ?? '', status: tire.status }) }} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
