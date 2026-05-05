import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Truck } from 'lucide-react'
import { api } from '@/lib/api'
import { useList } from '@/hooks/useList'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, Vehicle, Driver } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const STATUS_LABEL: Record<string, string> = { activo: 'Activo', en_servicio: 'En servicio', baja: 'Baja' }
const STATUS_COLOR: Record<string, string> = {
  activo: 'bg-green-100 text-green-700',
  en_servicio: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-500',
}
const TIPO_LABEL: Record<string, string> = { camion: 'Camión', camioneta: 'Camioneta', auto: 'Auto', otro: 'Otro' }

interface VF { plate: string; brand: string; model: string; year: string; vehicle_type: string; status: string; odometer: string; notes: string }
const EMPTY: VF = { plate: '', brand: '', model: '', year: '', vehicle_type: 'camion', status: 'activo', odometer: '0', notes: '' }

function toBody(f: VF, isNew: boolean) {
  const b: Record<string, unknown> = {
    plate: f.plate, brand: f.brand, model: f.model,
    year: f.year ? parseInt(f.year) : null,
    vehicle_type: f.vehicle_type, status: f.status,
    odometer: parseInt(f.odometer) || 0,
    notes: f.notes || null,
  }
  if (isNew) delete b.status
  return b
}

export default function VehiclesPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canCrear = can('vehiculos', 'crear')
  const canEditar = can('vehiculos', 'editar')
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<VF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<VF>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', page],
    queryFn: () => api.get<PaginatedResponse<Vehicle>>(`/vehicles?page=${page}&size=20`).then(r => r.data),
  })

  const { data: drivers } = useList<Driver>('drivers', '/drivers')
  const vehicleDriverMap = Object.fromEntries(
    (drivers ?? []).filter(d => d.vehicle_id).map(d => [d.vehicle_id!, d])
  )

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/vehicles', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); setAddingRow(false); setAddForm(EMPTY) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/vehicles/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); setEditingId(null) },
  })

  function startEdit(v: Vehicle) {
    setAddingRow(false)
    setEditingId(v.id)
    setEditForm({ plate: v.plate, brand: v.brand, model: v.model, year: v.year?.toString() ?? '', vehicle_type: v.vehicle_type, status: v.status, odometer: v.odometer.toString(), notes: v.notes ?? '' })
  }
  function ef(k: keyof VF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof VF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }

  function handleAdd(e: React.FormEvent) { e.preventDefault(); createMutation.mutate(toBody(addForm, true)) }
  function handleEdit(e: React.FormEvent) { e.preventDefault(); if (editingId) updateMutation.mutate({ id: editingId, body: toBody(editForm, false) }) }

  const isPending = createMutation.isPending || updateMutation.isPending

  const rowCls = 'border-b border-gray-50'
  const editRowCls = 'border-b border-blue-200 bg-blue-50'
  const addRowCls = 'border-b border-green-200 bg-green-50'

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
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vehículos</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} vehículos en la flota</p>
        </div>
        {canCrear && (
          <button
            onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Agregar vehículo</span>
            <span className="sm:hidden">Agregar</span>
          </button>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Patente', 'Marca', 'Modelo', 'Tipo', 'Año', 'Odómetro', 'Chofer', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRowCls}>
                  <form id="add-vehicle-form" onSubmit={handleAdd} />
                  <td className="px-3 py-2"><input form="add-vehicle-form" required value={addForm.plate} onChange={e => af('plate', e.target.value.toUpperCase())} placeholder="AB123CD *" className={CI + ' font-mono'} /></td>
                  <td className="px-3 py-2"><input form="add-vehicle-form" required value={addForm.brand} onChange={e => af('brand', e.target.value)} placeholder="Marca *" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-vehicle-form" required value={addForm.model} onChange={e => af('model', e.target.value)} placeholder="Modelo *" className={CI} /></td>
                  <td className="px-3 py-2">
                    <select form="add-vehicle-form" value={addForm.vehicle_type} onChange={e => af('vehicle_type', e.target.value)} className={CS}>
                      <option value="camion">Camión</option><option value="camioneta">Camioneta</option><option value="auto">Auto</option><option value="otro">Otro</option>
                    </select>
                  </td>
                  <td className="px-3 py-2"><input form="add-vehicle-form" type="number" value={addForm.year} onChange={e => af('year', e.target.value)} placeholder="2020" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-vehicle-form" type="number" min="0" value={addForm.odometer} onChange={e => af('odometer', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2 text-gray-400 text-xs">—</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">Activo</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-vehicle-form" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow ? (
                <tr><td colSpan={9} className="p-12 text-center">
                  <Truck size={32} className="text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 text-sm">No hay vehículos registrados.</p>
                </td></tr>
              ) : data?.items.map(v => {
                const driver = vehicleDriverMap[v.id]
                return editingId === v.id ? (
                  <tr key={v.id} className={editRowCls}>
                    <form id={`edit-${v.id}`} onSubmit={handleEdit} />
                    <td className="px-3 py-2"><input form={`edit-${v.id}`} required value={editForm.plate} onChange={e => ef('plate', e.target.value.toUpperCase())} className={CI + ' font-mono'} /></td>
                    <td className="px-3 py-2"><input form={`edit-${v.id}`} required value={editForm.brand} onChange={e => ef('brand', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`edit-${v.id}`} required value={editForm.model} onChange={e => ef('model', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><select form={`edit-${v.id}`} value={editForm.vehicle_type} onChange={e => ef('vehicle_type', e.target.value)} className={CS}><option value="camion">Camión</option><option value="camioneta">Camioneta</option><option value="auto">Auto</option><option value="otro">Otro</option></select></td>
                    <td className="px-3 py-2"><input form={`edit-${v.id}`} type="number" value={editForm.year} onChange={e => ef('year', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`edit-${v.id}`} type="number" min="0" value={editForm.odometer} onChange={e => ef('odometer', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{driver?.full_name ?? '—'}</td>
                    <td className="px-3 py-2"><select form={`edit-${v.id}`} value={editForm.status} onChange={e => ef('status', e.target.value)} className={CS}><option value="activo">Activo</option><option value="en_servicio">En servicio</option><option value="baja">Baja</option></select></td>
                    <td className="px-3 py-2"><div className="flex gap-1"><button form={`edit-${v.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                  </tr>
                ) : (
                  <tr key={v.id} className={rowCls + ' hover:bg-gray-50 transition-colors'}>
                    <td className="px-3 py-3 font-mono font-semibold text-gray-900">{v.plate}</td>
                    <td className="px-3 py-3 text-gray-700">{v.brand}</td>
                    <td className="px-3 py-3 text-gray-700">{v.model}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{TIPO_LABEL[v.vehicle_type]}</td>
                    <td className="px-3 py-3 text-gray-500">{v.year ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-600">{v.odometer.toLocaleString('es-AR')} km</td>
                    <td className="px-3 py-3 text-gray-600 text-sm">{driver ? driver.full_name : <span className="text-gray-300 text-xs">Sin asignar</span>}</td>
                    <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[v.status]}`}>{STATUS_LABEL[v.status]}</span></td>
                    <td className="px-3 py-3 text-right">{canEditar && <button onClick={() => startEdit(v)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>}</td>
                  </tr>
                )
              })}
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
            <p className="text-xs font-semibold text-green-700 mb-3 uppercase tracking-wide">Nuevo vehículo</p>
            <form onSubmit={handleAdd} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input required value={addForm.plate} onChange={e => af('plate', e.target.value.toUpperCase())} placeholder="Patente *" className={CI + ' font-mono'} autoFocus />
                <select value={addForm.vehicle_type} onChange={e => af('vehicle_type', e.target.value)} className={CS}>
                  <option value="camion">Camión</option><option value="camioneta">Camioneta</option><option value="auto">Auto</option><option value="otro">Otro</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input required value={addForm.brand} onChange={e => af('brand', e.target.value)} placeholder="Marca *" className={CI} />
                <input required value={addForm.model} onChange={e => af('model', e.target.value)} placeholder="Modelo *" className={CI} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" value={addForm.year} onChange={e => af('year', e.target.value)} placeholder="Año" className={CI} />
                <input type="number" min="0" value={addForm.odometer} onChange={e => af('odometer', e.target.value)} placeholder="Odómetro km" className={CI} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setAddingRow(false)} className="flex-1 border border-gray-200 text-sm py-2 rounded-lg text-gray-600">Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {data?.items.length === 0 && !addingRow && (
          <div className="text-center py-12">
            <Truck size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay vehículos registrados.</p>
          </div>
        )}

        {data?.items.map(v => {
          const driver = vehicleDriverMap[v.id]
          return editingId === v.id ? (
            <div key={v.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wide">Editando {v.plate}</p>
              <form onSubmit={handleEdit} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input required value={editForm.plate} onChange={e => ef('plate', e.target.value.toUpperCase())} className={CI + ' font-mono'} />
                  <select value={editForm.vehicle_type} onChange={e => ef('vehicle_type', e.target.value)} className={CS}>
                    <option value="camion">Camión</option><option value="camioneta">Camioneta</option><option value="auto">Auto</option><option value="otro">Otro</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input required value={editForm.brand} onChange={e => ef('brand', e.target.value)} className={CI} />
                  <input required value={editForm.model} onChange={e => ef('model', e.target.value)} className={CI} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" value={editForm.year} onChange={e => ef('year', e.target.value)} placeholder="Año" className={CI} />
                  <input type="number" min="0" value={editForm.odometer} onChange={e => ef('odometer', e.target.value)} placeholder="Odómetro" className={CI} />
                </div>
                <select value={editForm.status} onChange={e => ef('status', e.target.value)} className={CS}>
                  <option value="activo">Activo</option><option value="en_servicio">En servicio</option><option value="baja">Baja</option>
                </select>
                <div className="flex gap-2 pt-1">
                  <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">Guardar</button>
                  <button type="button" onClick={() => setEditingId(null)} className="flex-1 border border-gray-200 text-sm py-2 rounded-lg text-gray-600">Cancelar</button>
                </div>
              </form>
            </div>
          ) : (
            <div key={v.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono font-bold text-gray-900">{v.plate}</p>
                <p className="text-sm text-gray-600 mt-0.5">{v.brand} {v.model}{v.year ? ` (${v.year})` : ''}</p>
                <p className="text-xs text-gray-400 mt-0.5">{TIPO_LABEL[v.vehicle_type]} · {v.odometer.toLocaleString('es-AR')} km</p>
                {driver && <p className="text-xs text-gray-500 mt-0.5">{driver.full_name}</p>}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                {canEditar && <button onClick={() => startEdit(v)} className="text-xs text-blue-600 font-medium">Editar</button>}
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
