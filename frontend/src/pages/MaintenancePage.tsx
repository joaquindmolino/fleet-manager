import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wrench, ClipboardList } from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, MaintenanceService, MaintenanceRecord, Vehicle, Machine, Supplier } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

type Tab = 'records' | 'services'

interface RF { vehicle_id: string; machine_id: string; service_id: string; supplier_id: string; service_date: string; odometer_at_service: string; cost: string }
const RECORD_EMPTY: RF = {
  vehicle_id: '', machine_id: '', service_id: '', supplier_id: '',
  service_date: new Date().toISOString().split('T')[0],
  odometer_at_service: '', cost: '',
}

interface SF { name: string; applies_to: string; interval_km: string; interval_days: string }
const SERVICE_EMPTY: SF = { name: '', applies_to: 'vehiculo', interval_km: '', interval_days: '' }

const APPLIES_LABEL: Record<string, string> = { vehiculo: 'Vehículo', maquina: 'Máquina', ambos: 'Ambos' }

export default function MaintenancePage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canSeeMachines = can('maquinas', 'ver')
  const canSeeVehicles = can('vehiculos', 'ver')
  const canSeeSuppliers = can('proveedores', 'ver')
  const [tab, setTab] = useState<Tab>('records')
  const [recordPage, setRecordPage] = useState(1)

  const [recEditingId, setRecEditingId] = useState<string | null>(null)
  const [recEditForm, setRecEditForm] = useState<RF>(RECORD_EMPTY)
  const [recAddingRow, setRecAddingRow] = useState(false)
  const [recAddForm, setRecAddForm] = useState<RF>(RECORD_EMPTY)

  const [svcEditingId, setSvcEditingId] = useState<string | null>(null)
  const [svcEditForm, setSvcEditForm] = useState<SF>(SERVICE_EMPTY)
  const [svcAddingRow, setSvcAddingRow] = useState(false)
  const [svcAddForm, setSvcAddForm] = useState<SF>(SERVICE_EMPTY)

  const { data: records, isLoading: loadingRecords } = useQuery({
    queryKey: ['maintenance-records', recordPage],
    queryFn: () => api.get<PaginatedResponse<MaintenanceRecord>>(`/maintenance/records?page=${recordPage}&size=20`).then(r => r.data),
    enabled: tab === 'records',
  })

  // Services endpoint returns a plain list (not paginated)
  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['maintenance-services'],
    queryFn: () => api.get<MaintenanceService[]>('/maintenance/services').then(r => r.data),
    enabled: tab === 'services',
  })

  const { data: vehicles } = useList<Vehicle>('vehicles', '/vehicles', 100, canSeeVehicles)
  const { data: machines } = useList<Machine>('machines', '/machines', 100, canSeeMachines)
  // Services list also used in records dropdowns — fetch as plain list
  const { data: allServices } = useQuery({
    queryKey: ['maintenance-services'],
    queryFn: () => api.get<MaintenanceService[]>('/maintenance/services').then(r => r.data),
    staleTime: 60_000,
  })
  const { data: suppliers } = useList<Supplier>('suppliers', '/suppliers', 100, canSeeSuppliers)

  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]))
  const machineMap = Object.fromEntries((machines ?? []).map(m => [m.id, m]))
  const serviceMap = Object.fromEntries((allServices ?? []).map(s => [s.id, s]))
  const supplierMap = Object.fromEntries((suppliers ?? []).map(s => [s.id, s]))

  const createRecord = useMutation({
    mutationFn: (body: object) => api.post('/maintenance/records', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-records'] }); setRecAddingRow(false); setRecAddForm(RECORD_EMPTY) },
  })
  const updateRecord = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/maintenance/records/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-records'] }); setRecEditingId(null) },
  })
  const createService = useMutation({
    mutationFn: (body: object) => api.post('/maintenance/services', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-services'] }); setSvcAddingRow(false); setSvcAddForm(SERVICE_EMPTY) },
  })
  const updateService = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/maintenance/services/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-services'] }); setSvcEditingId(null) },
  })

  function startEditRecord(r: MaintenanceRecord) {
    setRecAddingRow(false); setRecEditingId(r.id)
    setRecEditForm({ vehicle_id: r.vehicle_id ?? '', machine_id: r.machine_id ?? '', service_id: r.service_id ?? '', supplier_id: r.supplier_id ?? '', service_date: r.service_date, odometer_at_service: r.odometer_at_service?.toString() ?? '', cost: r.cost ?? '' })
  }
  function startEditService(s: MaintenanceService) {
    setSvcAddingRow(false); setSvcEditingId(s.id)
    setSvcEditForm({ name: s.name, applies_to: s.applies_to, interval_km: s.interval_km?.toString() ?? '', interval_days: s.interval_days?.toString() ?? '' })
  }

  function recBody(f: RF) {
    return {
      vehicle_id: f.vehicle_id || null, machine_id: f.machine_id || null,
      service_id: f.service_id || null, supplier_id: f.supplier_id || null,
      service_date: f.service_date,
      odometer_at_service: f.odometer_at_service ? parseInt(f.odometer_at_service) : null,
      cost: f.cost || null,
    }
  }
  function svcBody(f: SF) {
    return {
      name: f.name, applies_to: f.applies_to,
      interval_km: f.interval_km ? parseInt(f.interval_km) : null,
      interval_days: f.interval_days ? parseInt(f.interval_days) : null,
    }
  }

  function ref(k: keyof RF, v: string) { setRecEditForm(p => ({ ...p, [k]: v })) }
  function raf(k: keyof RF, v: string) { setRecAddForm(p => ({ ...p, [k]: v })) }
  function sef(k: keyof SF, v: string) { setSvcEditForm(p => ({ ...p, [k]: v })) }
  function saf(k: keyof SF, v: string) { setSvcAddForm(p => ({ ...p, [k]: v })) }

  const recPending = createRecord.isPending || updateRecord.isPending
  const svcPending = createService.isPending || updateService.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mantenimiento</h1>
          <p className="text-sm text-gray-500 mt-0.5">Historial de servicios y tipos de mantenimiento</p>
        </div>
        <button
          onClick={() => {
            if (tab === 'records') { setRecAddingRow(true); setRecEditingId(null); setRecAddForm(RECORD_EMPTY) }
            else { setSvcAddingRow(true); setSvcEditingId(null); setSvcAddForm(SERVICE_EMPTY) }
          }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={16} /> {tab === 'records' ? 'Registrar servicio' : 'Agregar tipo'}
        </button>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setTab('records')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'records' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <span className="flex items-center gap-1.5"><ClipboardList size={14} /> Historial</span>
        </button>
        <button onClick={() => setTab('services')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'services' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <span className="flex items-center gap-1.5"><Wrench size={14} /> Tipos de servicio</span>
        </button>
      </div>

      {/* ── Historial ── */}
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
                        {canSeeVehicles && (
                          <select form="add-rec" value={recAddForm.vehicle_id} onChange={e => { raf('vehicle_id', e.target.value); if (e.target.value) raf('machine_id', '') }} className={CS}>
                            <option value="">— Vehículo</option>
                            {(vehicles ?? []).map(v => <option key={v.id} value={v.id}>{v.plate} {v.brand} {v.model}</option>)}
                          </select>
                        )}
                        {canSeeMachines && (
                          <select form="add-rec" value={recAddForm.machine_id} onChange={e => { raf('machine_id', e.target.value); if (e.target.value) raf('vehicle_id', '') }} className={CS}>
                            <option value="">— Máquina</option>
                            {(machines ?? []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select form="add-rec" value={recAddForm.service_id} onChange={e => raf('service_id', e.target.value)} className={CS}>
                        <option value="">— Tipo</option>
                        {(allServices ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input form="add-rec" type="number" min="0" value={recAddForm.odometer_at_service} onChange={e => raf('odometer_at_service', e.target.value)} placeholder="Km / h" className={CI} /></td>
                    <td className="px-3 py-2">
                      <select form="add-rec" value={recAddForm.supplier_id} onChange={e => raf('supplier_id', e.target.value)} className={CS}>
                        <option value="">— Proveedor</option>
                        {(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2"><input form="add-rec" type="number" min="0" step="0.01" value={recAddForm.cost} onChange={e => raf('cost', e.target.value)} placeholder="$" className={CI} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button form="add-rec" type="submit" disabled={recPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setRecAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                      </div>
                    </td>
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
                        <td className="px-3 py-2">
                          <div className="flex flex-col gap-1">
                            {canSeeVehicles && (
                              <select form={`er-${r.id}`} value={recEditForm.vehicle_id} onChange={e => { ref('vehicle_id', e.target.value); if (e.target.value) ref('machine_id', '') }} className={CS}>
                                <option value="">— Vehículo</option>
                                {(vehicles ?? []).map(v2 => <option key={v2.id} value={v2.id}>{v2.plate} {v2.brand} {v2.model}</option>)}
                              </select>
                            )}
                            {canSeeMachines && (
                              <select form={`er-${r.id}`} value={recEditForm.machine_id} onChange={e => { ref('machine_id', e.target.value); if (e.target.value) ref('vehicle_id', '') }} className={CS}>
                                <option value="">— Máquina</option>
                                {(machines ?? []).map(m2 => <option key={m2.id} value={m2.id}>{m2.name}</option>)}
                              </select>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select form={`er-${r.id}`} value={recEditForm.service_id} onChange={e => ref('service_id', e.target.value)} className={CS}>
                            <option value="">— Tipo</option>
                            {(allServices ?? []).map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input form={`er-${r.id}`} type="number" min="0" value={recEditForm.odometer_at_service} onChange={e => ref('odometer_at_service', e.target.value)} className={CI} /></td>
                        <td className="px-3 py-2">
                          <select form={`er-${r.id}`} value={recEditForm.supplier_id} onChange={e => ref('supplier_id', e.target.value)} className={CS}>
                            <option value="">— Proveedor</option>
                            {(suppliers ?? []).map(s2 => <option key={s2.id} value={s2.id}>{s2.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2"><input form={`er-${r.id}`} type="number" min="0" step="0.01" value={recEditForm.cost} onChange={e => ref('cost', e.target.value)} className={CI} /></td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            <button form={`er-${r.id}`} type="submit" disabled={recPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                            <button type="button" onClick={() => setRecEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={r.id} className={row}>
                        <td className="px-3 py-3 text-gray-700">{r.service_date}</td>
                        <td className="px-3 py-3 font-mono text-xs font-semibold text-gray-800">{unit}</td>
                        <td className="px-3 py-3 text-gray-700">{s?.name ?? <span className="text-gray-400 text-xs">Sin tipo</span>}</td>
                        <td className="px-3 py-3 text-gray-500 text-xs">{r.odometer_at_service?.toLocaleString('es-AR') ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-500">{sup?.name ?? '—'}</td>
                        <td className="px-3 py-3 text-gray-700">{r.cost ? `$ ${parseFloat(r.cost).toLocaleString('es-AR')}` : '—'}</td>
                        <td className="px-3 py-3 text-right"><button onClick={() => startEditRecord(r)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
                      </tr>
                    )
                  })
                }
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

      {/* ── Tipos de servicio ── */}
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
                    <td className="px-3 py-2">
                      <select form="add-svc" value={svcAddForm.applies_to} onChange={e => saf('applies_to', e.target.value)} className={CS}>
                        <option value="vehiculo">Vehículo</option>
                        <option value="maquina">Máquina</option>
                        <option value="ambos">Ambos</option>
                      </select>
                    </td>
                    <td className="px-3 py-2"><input form="add-svc" type="number" min="0" value={svcAddForm.interval_km} onChange={e => saf('interval_km', e.target.value)} placeholder="10000" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-svc" type="number" min="0" value={svcAddForm.interval_days} onChange={e => saf('interval_days', e.target.value)} placeholder="365" className={CI} /></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button form="add-svc" type="submit" disabled={svcPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setSvcAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )}

                {(!services || services.length === 0) && !svcAddingRow
                  ? <tr><td colSpan={5} className="p-12 text-center"><Wrench size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay tipos de servicio configurados.</p></td></tr>
                  : services?.map(s => svcEditingId === s.id ? (
                    <tr key={s.id} className={editRow}>
                      <form id={`es-${s.id}`} onSubmit={e => { e.preventDefault(); updateService.mutate({ id: s.id, body: svcBody(svcEditForm) }) }} />
                      <td className="px-3 py-2"><input form={`es-${s.id}`} required value={svcEditForm.name} onChange={e => sef('name', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2">
                        <select form={`es-${s.id}`} value={svcEditForm.applies_to} onChange={e => sef('applies_to', e.target.value)} className={CS}>
                          <option value="vehiculo">Vehículo</option>
                          <option value="maquina">Máquina</option>
                          <option value="ambos">Ambos</option>
                        </select>
                      </td>
                      <td className="px-3 py-2"><input form={`es-${s.id}`} type="number" min="0" value={svcEditForm.interval_km} onChange={e => sef('interval_km', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2"><input form={`es-${s.id}`} type="number" min="0" value={svcEditForm.interval_days} onChange={e => sef('interval_days', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button form={`es-${s.id}`} type="submit" disabled={svcPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                          <button type="button" onClick={() => setSvcEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className={row}>
                      <td className="px-3 py-3 font-medium text-gray-900">{s.name}</td>
                      <td className="px-3 py-3 text-gray-500 text-xs">{APPLIES_LABEL[s.applies_to] ?? s.applies_to}</td>
                      <td className="px-3 py-3 text-gray-500">{s.interval_km ? `${s.interval_km.toLocaleString('es-AR')} km` : '—'}</td>
                      <td className="px-3 py-3 text-gray-500">{s.interval_days ? `${s.interval_days} días` : '—'}</td>
                      <td className="px-3 py-3 text-right"><button onClick={() => startEditService(s)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
