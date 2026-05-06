import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Users, AlertTriangle, UserCheck } from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, Driver, Vehicle } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const STATUS_LABEL: Record<string, string> = { activo: 'Activo', inactivo: 'Inactivo', baja: 'Baja' }
const STATUS_COLOR: Record<string, string> = {
  activo: 'bg-green-100 text-green-700',
  inactivo: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-500',
}

interface UserPicker { id: string; full_name: string; username: string; email: string | null; is_active: boolean }

function licenseExpiryInfo(expiry: string | null): { label: string; color: string; warn: boolean } {
  if (!expiry) return { label: '—', color: 'text-gray-400', warn: false }
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000)
  const label = new Date(expiry).toLocaleDateString('es-AR')
  if (days < 0) return { label, color: 'text-red-600 font-medium', warn: true }
  if (days <= 60) return { label, color: 'text-amber-600 font-medium', warn: true }
  return { label, color: 'text-gray-500', warn: false }
}

interface DF { full_name: string; license_number: string; license_expiry: string; phone: string; vehicle_id: string; user_id: string; status: string }
const EMPTY: DF = { full_name: '', license_number: '', license_expiry: '', phone: '', vehicle_id: '', user_id: '', status: 'activo' }

function toBody(f: DF, isNew: boolean) {
  return {
    full_name: f.full_name,
    license_number: f.license_number || null,
    license_expiry: f.license_expiry || null,
    phone: f.phone || null,
    vehicle_id: f.vehicle_id || null,
    user_id: f.user_id || null,
    ...(isNew ? {} : { status: f.status }),
  }
}

export default function DriversPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canSeeVehicles = can('vehiculos', 'ver')
  const canCrear = can('conductores', 'crear')
  const canEditar = can('conductores', 'editar')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<DF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<DF>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', page],
    queryFn: () => api.get<PaginatedResponse<Driver>>(`/drivers?page=${page}&size=20`).then(r => r.data),
  })

  const { data: vehicles } = useList<Vehicle>('vehicles', '/vehicles', 100, canSeeVehicles)
  const vehicleMap = Object.fromEntries((vehicles ?? []).map(v => [v.id, v]))

  const { data: userPickers } = useQuery({
    queryKey: ['users-for-assignment'],
    queryFn: () => api.get<UserPicker[]>('/users/for-assignment').then(r => r.data),
    staleTime: 60_000,
  })
  const userMap = Object.fromEntries((userPickers ?? []).map(u => [u.id, u]))

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/drivers', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] }); qc.invalidateQueries({ queryKey: ['stats'] })
      setAddingRow(false); setAddForm(EMPTY)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/drivers/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] }); qc.invalidateQueries({ queryKey: ['stats'] })
      setEditingId(null)
    },
  })

  function startEdit(d: Driver) {
    setAddingRow(false); setEditingId(d.id)
    setEditForm({ full_name: d.full_name, license_number: d.license_number ?? '', license_expiry: d.license_expiry ?? '', phone: d.phone ?? '', vehicle_id: d.vehicle_id ?? '', user_id: d.user_id ?? '', status: d.status })
  }
  function ef(k: keyof DF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof DF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  const activeVehicles = (vehicles ?? []).filter(v => v.status !== 'baja')

  const assignedUserIds = new Set(
    (data?.items ?? []).filter(d => d.user_id && d.id !== editingId).map(d => d.user_id!)
  )
  const availableUsers = (userPickers ?? []).filter(u => !assignedUserIds.has(u.id))

  const paginationEl = data && data.pages > 1 && (
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conductores</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} conductores registrados</p>
        </div>
        {canCrear && (
          <button
            onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Agregar conductor</span>
            <span className="sm:hidden">Agregar</span>
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre', 'Teléfono', 'Vehículo', 'Usuario de acceso', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-d" onSubmit={e => { e.preventDefault(); createMutation.mutate(toBody(addForm, true)) }} />
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <input form="add-d" required value={addForm.full_name} onChange={e => af('full_name', e.target.value)} placeholder="Juan Pérez *" className={CI} />
                      <input form="add-d" value={addForm.license_number} onChange={e => af('license_number', e.target.value)} placeholder="N° Licencia" className={CI} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <input form="add-d" value={addForm.phone} onChange={e => af('phone', e.target.value)} placeholder="+54 9 11..." className={CI} />
                      <input form="add-d" type="date" value={addForm.license_expiry} onChange={e => af('license_expiry', e.target.value)} title="Venc. licencia" className={CI} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select form="add-d" value={addForm.vehicle_id} onChange={e => af('vehicle_id', e.target.value)} className={CS}>
                      <option value="">Sin asignar</option>
                      {activeVehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select form="add-d" value={addForm.user_id} onChange={e => af('user_id', e.target.value)} className={CS}>
                      <option value="">Sin usuario</option>
                      {availableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">Activo</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-d" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow
                ? <tr><td colSpan={6} className="p-12 text-center"><Users size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay conductores registrados.</p></td></tr>
                : data?.items.map(d => {
                  const v = d.vehicle_id ? vehicleMap[d.vehicle_id] : null
                  const u = d.user_id ? userMap[d.user_id] : null
                  const expiry = licenseExpiryInfo(d.license_expiry)
                  return editingId === d.id ? (
                    <tr key={d.id} className={editRow}>
                      <form id={`e-${d.id}`} onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: d.id, body: toBody(editForm, false) }) }} />
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <input form={`e-${d.id}`} required value={editForm.full_name} onChange={e => ef('full_name', e.target.value)} className={CI} />
                          <input form={`e-${d.id}`} value={editForm.license_number} onChange={e => ef('license_number', e.target.value)} placeholder="N° Licencia" className={CI} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-1">
                          <input form={`e-${d.id}`} value={editForm.phone} onChange={e => ef('phone', e.target.value)} placeholder="Teléfono" className={CI} />
                          <input form={`e-${d.id}`} type="date" value={editForm.license_expiry} onChange={e => ef('license_expiry', e.target.value)} title="Venc. licencia" className={CI} />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select form={`e-${d.id}`} value={editForm.vehicle_id} onChange={e => ef('vehicle_id', e.target.value)} className={CS}>
                          <option value="">Sin asignar</option>
                          {activeVehicles.map(v2 => <option key={v2.id} value={v2.id}>{v2.plate} — {v2.brand} {v2.model}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select form={`e-${d.id}`} value={editForm.user_id} onChange={e => ef('user_id', e.target.value)} className={CS}>
                          <option value="">Sin usuario</option>
                          {(userPickers ?? [])
                            .filter(u2 => !assignedUserIds.has(u2.id) || u2.id === d.user_id)
                            .map(u2 => <option key={u2.id} value={u2.id}>{u2.full_name} ({u2.username})</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <select form={`e-${d.id}`} value={editForm.status} onChange={e => ef('status', e.target.value)} className={CS}>
                          <option value="activo">Activo</option>
                          <option value="inactivo">Inactivo</option>
                          <option value="baja">Baja</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button form={`e-${d.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={d.id} className={row}>
                      <td className="px-3 py-3">
                        <p className="font-medium text-gray-900">{d.full_name}</p>
                        {d.license_number && <p className="text-xs text-gray-400 font-mono mt-0.5">{d.license_number}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-gray-500">{d.phone ?? '—'}</p>
                        {expiry.warn && (
                          <span className={`text-xs flex items-center gap-1 mt-0.5 ${expiry.color}`}>
                            <AlertTriangle size={11} /> Venc. {expiry.label}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {v
                          ? <span className="font-mono font-semibold text-gray-800 text-xs">{v.plate} <span className="font-normal text-gray-400">{v.brand} {v.model}</span></span>
                          : <span className="text-gray-300 text-xs">Sin asignar</span>}
                      </td>
                      <td className="px-3 py-3">
                        {u
                          ? <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium"><UserCheck size={11} />{u.full_name}</span>
                          : <span className="text-gray-300 text-xs">Sin usuario</span>}
                      </td>
                      <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status] ?? d.status}</span></td>
                      <td className="px-3 py-3 text-right">{canEditar && <button onClick={() => startEdit(d)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>}</td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        )}
        {paginationEl}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden mt-2 space-y-3">
        {isLoading && <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>}

        {addingRow && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-green-700 mb-3 uppercase tracking-wide">Nuevo conductor</p>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(toBody(addForm, true)) }} className="space-y-2">
              <input required value={addForm.full_name} onChange={e => af('full_name', e.target.value)} placeholder="Nombre completo *" className={CI} autoFocus />
              <div className="grid grid-cols-2 gap-2">
                <input value={addForm.license_number} onChange={e => af('license_number', e.target.value)} placeholder="N° Licencia" className={CI} />
                <input type="date" value={addForm.license_expiry} onChange={e => af('license_expiry', e.target.value)} title="Venc. licencia" className={CI} />
              </div>
              <input value={addForm.phone} onChange={e => af('phone', e.target.value)} placeholder="Teléfono" className={CI} />
              <select value={addForm.vehicle_id} onChange={e => af('vehicle_id', e.target.value)} className={CS}>
                <option value="">Sin vehículo asignado</option>
                {activeVehicles.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
              </select>
              <select value={addForm.user_id} onChange={e => af('user_id', e.target.value)} className={CS}>
                <option value="">Sin usuario de acceso</option>
                {availableUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.username})</option>)}
              </select>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setAddingRow(false)} className="flex-1 border border-gray-200 text-sm py-2 rounded-lg text-gray-600">Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {data?.items.length === 0 && !addingRow && (
          <div className="text-center py-12">
            <Users size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay conductores registrados.</p>
          </div>
        )}

        {data?.items.map(d => {
          const v = d.vehicle_id ? vehicleMap[d.vehicle_id] : null
          const u = d.user_id ? userMap[d.user_id] : null
          const expiry = licenseExpiryInfo(d.license_expiry)
          return editingId === d.id ? (
            <div key={d.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wide">Editando {d.full_name}</p>
              <form onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: d.id, body: toBody(editForm, false) }) }} className="space-y-2">
                <input required value={editForm.full_name} onChange={e => ef('full_name', e.target.value)} className={CI} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={editForm.license_number} onChange={e => ef('license_number', e.target.value)} placeholder="N° Licencia" className={CI} />
                  <input type="date" value={editForm.license_expiry} onChange={e => ef('license_expiry', e.target.value)} title="Venc. licencia" className={CI} />
                </div>
                <input value={editForm.phone} onChange={e => ef('phone', e.target.value)} placeholder="Teléfono" className={CI} />
                <select value={editForm.vehicle_id} onChange={e => ef('vehicle_id', e.target.value)} className={CS}>
                  <option value="">Sin vehículo asignado</option>
                  {activeVehicles.map(v2 => <option key={v2.id} value={v2.id}>{v2.plate} — {v2.brand} {v2.model}</option>)}
                </select>
                <select value={editForm.user_id} onChange={e => ef('user_id', e.target.value)} className={CS}>
                  <option value="">Sin usuario de acceso</option>
                  {(userPickers ?? [])
                    .filter(u2 => !assignedUserIds.has(u2.id) || u2.id === d.user_id)
                    .map(u2 => <option key={u2.id} value={u2.id}>{u2.full_name} ({u2.username})</option>)}
                </select>
                <select value={editForm.status} onChange={e => ef('status', e.target.value)} className={CS}>
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="baja">Baja</option>
                </select>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">Guardar</button>
                  <button type="button" onClick={() => setEditingId(null)} className="flex-1 border border-gray-200 text-sm py-2 rounded-lg text-gray-600">Cancelar</button>
                </div>
              </form>
            </div>
          ) : (
            <div key={d.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{d.full_name}</p>
                {d.license_number && <p className="text-xs text-gray-400 font-mono mt-0.5">{d.license_number}</p>}
                {d.phone && <p className="text-sm text-gray-500 mt-0.5">{d.phone}</p>}
                {expiry.warn && (
                  <span className={`text-xs flex items-center gap-1 mt-0.5 ${expiry.color}`}>
                    <AlertTriangle size={11} /> Venc. licencia {expiry.label}
                  </span>
                )}
                {v
                  ? <p className="text-xs text-gray-500 mt-1 font-mono">{v.plate} <span className="font-sans text-gray-400">{v.brand} {v.model}</span></p>
                  : <p className="text-xs text-gray-300 mt-1">Sin vehículo asignado</p>}
                {u && (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium mt-1">
                    <UserCheck size={11} />{u.full_name}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status] ?? d.status}</span>
                {canEditar && <button onClick={() => startEdit(d)} className="text-xs text-blue-600 font-medium">Editar</button>}
              </div>
            </div>
          )
        })}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between py-2">
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
