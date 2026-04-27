import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Circle } from 'lucide-react'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import type { PaginatedResponse, Vehicle, Tire } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const STATUS_COLOR: Record<string, string> = {
  en_uso: 'bg-green-100 text-green-700',
  en_stock: 'bg-blue-100 text-blue-700',
  reencauchado: 'bg-amber-100 text-amber-700',
  descartado: 'bg-gray-100 text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  en_uso: 'En uso', en_stock: 'En stock', reencauchado: 'Reencauchado', descartado: 'Descartado',
}

interface TF { position: string; axle: string; brand: string; model: string; size: string; serial_number: string; km_at_install: string; km_limit: string }
const EMPTY: TF = { position: '', axle: '', brand: '', model: '', size: '', serial_number: '', km_at_install: '0', km_limit: '' }

interface EF { position: string; brand: string; model: string; size: string; serial_number: string; km_limit: string; status: string }

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

export default function TiresPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const canSeeVehicles = can('vehiculos', 'ver')
  const [selectedVehicleId, setSelectedVehicleId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EF>({ position: '', brand: '', model: '', size: '', serial_number: '', km_limit: '', status: 'en_uso' })
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<TF>(EMPTY)

  const { data: vehicles } = useQuery({
    queryKey: ['vehicles', 'all'],
    queryFn: () => api.get<PaginatedResponse<Vehicle>>('/vehicles?size=100').then(r => r.data.items),
    staleTime: 60_000,
    enabled: canSeeVehicles,
  })

  const { data: tires, isLoading } = useQuery({
    queryKey: ['tires', selectedVehicleId],
    queryFn: () => api.get<Tire[]>(`/tires/vehicle/${selectedVehicleId}`).then(r => r.data),
    enabled: !!selectedVehicleId,
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/tires', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tires', selectedVehicleId] })
      setAddingRow(false); setAddForm(EMPTY)
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/tires/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tires', selectedVehicleId] })
      setEditingId(null)
    },
  })

  const selectedVehicle = vehicles?.find(v => v.id === selectedVehicleId)

  function startEdit(t: Tire) {
    setAddingRow(false); setEditingId(t.id)
    setEditForm({ position: t.position, brand: t.brand ?? '', model: t.model ?? '', size: t.size ?? '', serial_number: t.serial_number ?? '', km_limit: t.km_limit?.toString() ?? '', status: t.status })
  }
  function ef(k: keyof EF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof TF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending

  const alertTires = tires?.filter(t => t.km_limit && t.current_km >= t.km_limit * 0.9 && t.status === 'en_uso') ?? []

  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Neumáticos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Control por posición y km</p>
        </div>
        {selectedVehicleId && (
          <button onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus size={16} /> Agregar neumático
          </button>
        )}
      </div>

      <div className="mb-5">
        <label className="block text-xs font-medium text-gray-700 mb-1.5">Seleccionar vehículo</label>
        <select value={selectedVehicleId} onChange={e => { setSelectedVehicleId(e.target.value); setAddingRow(false); setEditingId(null) }}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[280px]">
          <option value="">— Elegir vehículo —</option>
          {vehicles?.map(v => <option key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</option>)}
        </select>
      </div>

      {!selectedVehicleId ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
          Seleccioná un vehículo para ver sus neumáticos.
        </div>
      ) : isLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm">Cargando...</div>
      ) : (
        <>
          {alertTires.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-medium text-red-700">
                {alertTires.length === 1 ? '1 neumático cerca o superando el límite de km:' : `${alertTires.length} neumáticos cerca o superando el límite de km:`}
              </p>
              <p className="text-xs text-red-600 mt-0.5">{alertTires.map(t => t.position).join(', ')}</p>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">
                {selectedVehicle?.plate} — {selectedVehicle?.brand} {selectedVehicle?.model}
                <span className="text-gray-400 ml-2 font-normal">{tires?.length ?? 0} neumáticos registrados</span>
              </p>
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
                {addingRow && (
                  <tr className={addRow}>
                    <form id="add-tire" onSubmit={e => {
                      e.preventDefault()
                      createMutation.mutate({
                        vehicle_id: selectedVehicleId,
                        position: addForm.position, axle: addForm.axle ? parseInt(addForm.axle) : null,
                        brand: addForm.brand || null, model: addForm.model || null, size: addForm.size || null,
                        serial_number: addForm.serial_number || null,
                        km_at_install: parseInt(addForm.km_at_install) || 0,
                        km_limit: addForm.km_limit ? parseInt(addForm.km_limit) : null,
                      })
                    }} />
                    <td className="px-3 py-2"><input form="add-tire" required value={addForm.position} onChange={e => af('position', e.target.value)} placeholder="eje1_izq *" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-tire" value={addForm.brand} onChange={e => af('brand', e.target.value)} placeholder="Bridgestone" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-tire" value={addForm.model} onChange={e => af('model', e.target.value)} placeholder="R295" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-tire" value={addForm.size} onChange={e => af('size', e.target.value)} placeholder="295/80 R22.5" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-tire" value={addForm.serial_number} onChange={e => af('serial_number', e.target.value)} placeholder="SN-123" className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-tire" type="number" min="0" value={addForm.km_at_install} onChange={e => af('km_at_install', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form="add-tire" type="number" min="0" value={addForm.km_limit} onChange={e => af('km_limit', e.target.value)} placeholder="80000" className={CI} /></td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 text-gray-400 text-xs">En uso</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button form="add-tire" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                      </div>
                    </td>
                  </tr>
                )}

                {!tires || (tires.length === 0 && !addingRow) ? (
                  <tr><td colSpan={10} className="p-12 text-center">
                    <Circle size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No hay neumáticos registrados para este vehículo.</p>
                    <button onClick={() => setAddingRow(true)} className="mt-3 text-sm text-blue-600 hover:text-blue-800 font-medium">Agregar el primero</button>
                  </td></tr>
                ) : tires?.map(tire => editingId === tire.id ? (
                  <tr key={tire.id} className={editRow}>
                    <form id={`e-${tire.id}`} onSubmit={e => {
                      e.preventDefault()
                      updateMutation.mutate({ id: tire.id, body: { position: editForm.position, brand: editForm.brand || null, model: editForm.model || null, size: editForm.size || null, serial_number: editForm.serial_number || null, km_limit: editForm.km_limit ? parseInt(editForm.km_limit) : null, status: editForm.status } })
                    }} />
                    <td className="px-3 py-2"><input form={`e-${tire.id}`} required value={editForm.position} onChange={e => ef('position', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`e-${tire.id}`} value={editForm.brand} onChange={e => ef('brand', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`e-${tire.id}`} value={editForm.model} onChange={e => ef('model', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`e-${tire.id}`} value={editForm.size} onChange={e => ef('size', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`e-${tire.id}`} value={editForm.serial_number} onChange={e => ef('serial_number', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2 text-gray-400 text-xs">{tire.km_at_install.toLocaleString('es-AR')}</td>
                    <td className="px-3 py-2"><input form={`e-${tire.id}`} type="number" min="0" value={editForm.km_limit} onChange={e => ef('km_limit', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <select form={`e-${tire.id}`} value={editForm.status} onChange={e => ef('status', e.target.value)} className={CS}>
                        <option value="en_uso">En uso</option>
                        <option value="en_stock">En stock</option>
                        <option value="reencauchado">Reencauchado</option>
                        <option value="descartado">Descartado</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button form={`e-${tire.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                      </div>
                    </td>
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
                    <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[tire.status]}`}>{STATUS_LABEL[tire.status] ?? tire.status}</span></td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => startEdit(tire)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
