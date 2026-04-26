import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Forklift } from 'lucide-react'
import { api } from '@/lib/api'
import type { PaginatedResponse, Machine } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const TYPE_LABEL: Record<string, string> = {
  autoelevador_gasoil: 'Autoelevador gasoil',
  apilador_electrico: 'Apilador eléctrico',
  otro: 'Otro',
}
const STATUS_LABEL: Record<string, string> = { activo: 'Activo', en_servicio: 'En servicio', baja: 'Baja' }
const STATUS_COLOR: Record<string, string> = {
  activo: 'bg-green-100 text-green-700',
  en_servicio: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-500',
}

interface MF { name: string; brand: string; model: string; year: string; machine_type: string; serial_number: string; hours_used: string; status: string }
const EMPTY: MF = { name: '', brand: '', model: '', year: '', machine_type: 'autoelevador_gasoil', serial_number: '', hours_used: '0', status: 'activo' }

function toBody(f: MF, isNew: boolean) {
  const b: Record<string, unknown> = {
    name: f.name, brand: f.brand || null, model: f.model || null,
    year: f.year ? parseInt(f.year) : null,
    machine_type: f.machine_type,
    serial_number: f.serial_number || null,
    hours_used: parseInt(f.hours_used) || 0,
  }
  if (!isNew) b.status = f.status
  return b
}

export default function MachinesPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<MF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<MF>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ['machines', page],
    queryFn: () => api.get<PaginatedResponse<Machine>>(`/machines?page=${page}&size=20`).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/machines', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); setAddingRow(false); setAddForm(EMPTY) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/machines/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); setEditingId(null) },
  })

  function startEdit(m: Machine) {
    setAddingRow(false); setEditingId(m.id)
    setEditForm({ name: m.name, brand: m.brand ?? '', model: m.model ?? '', year: m.year?.toString() ?? '', machine_type: m.machine_type, serial_number: m.serial_number ?? '', hours_used: m.hours_used.toString(), status: m.status })
  }
  function ef(k: keyof MF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof MF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Máquinas</h1><p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} máquinas registradas</p></div>
        <button onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"><Plus size={16} /> Agregar máquina</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre', 'Tipo', 'Marca', 'Modelo', 'Año', 'Horas', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-m" onSubmit={e => { e.preventDefault(); createMutation.mutate(toBody(addForm, true)) }} />
                  <td className="px-3 py-2"><input form="add-m" required value={addForm.name} onChange={e => af('name', e.target.value)} placeholder="Nombre *" className={CI} /></td>
                  <td className="px-3 py-2">
                    <select form="add-m" value={addForm.machine_type} onChange={e => af('machine_type', e.target.value)} className={CS}>
                      <option value="autoelevador_gasoil">Autoelevador gasoil</option>
                      <option value="apilador_electrico">Apilador eléctrico</option>
                      <option value="otro">Otro</option>
                    </select>
                  </td>
                  <td className="px-3 py-2"><input form="add-m" value={addForm.brand} onChange={e => af('brand', e.target.value)} placeholder="Toyota" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-m" value={addForm.model} onChange={e => af('model', e.target.value)} placeholder="8FBE15" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-m" type="number" min="1990" max="2099" value={addForm.year} onChange={e => af('year', e.target.value)} placeholder="2020" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-m" type="number" min="0" value={addForm.hours_used} onChange={e => af('hours_used', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2 text-gray-400 text-xs">Activo</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-m" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow
                ? <tr><td colSpan={8} className="p-12 text-center"><Forklift size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay máquinas registradas.</p></td></tr>
                : data?.items.map(m => editingId === m.id ? (
                  <tr key={m.id} className={editRow}>
                    <form id={`e-${m.id}`} onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: m.id, body: toBody(editForm, false) }) }} />
                    <td className="px-3 py-2"><input form={`e-${m.id}`} required value={editForm.name} onChange={e => ef('name', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2">
                      <select form={`e-${m.id}`} value={editForm.machine_type} onChange={e => ef('machine_type', e.target.value)} className={CS}>
                        <option value="autoelevador_gasoil">Autoelevador gasoil</option>
                        <option value="apilador_electrico">Apilador eléctrico</option>
                        <option value="otro">Otro</option>
                      </select>
                    </td>
                    <td className="px-3 py-2"><input form={`e-${m.id}`} value={editForm.brand} onChange={e => ef('brand', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`e-${m.id}`} value={editForm.model} onChange={e => ef('model', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2"><input form={`e-${m.id}`} type="number" min="1990" max="2099" value={editForm.year} onChange={e => ef('year', e.target.value)} className={CI} /></td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <input form={`e-${m.id}`} type="number" min="0" value={editForm.hours_used} onChange={e => ef('hours_used', e.target.value)} className={CI} />
                        <input form={`e-${m.id}`} value={editForm.serial_number} onChange={e => ef('serial_number', e.target.value)} placeholder="N° Serie" className={CI} />
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select form={`e-${m.id}`} value={editForm.status} onChange={e => ef('status', e.target.value)} className={CS}>
                        <option value="activo">Activo</option>
                        <option value="en_servicio">En servicio</option>
                        <option value="baja">Baja</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button form={`e-${m.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={m.id} className={row}>
                    <td className="px-3 py-3 font-medium text-gray-900">{m.name}</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">{TYPE_LABEL[m.machine_type] ?? m.machine_type}</td>
                    <td className="px-3 py-3 text-gray-500">{m.brand ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{m.model ?? '—'}</td>
                    <td className="px-3 py-3 text-gray-500">{m.year ?? '—'}</td>
                    <td className="px-3 py-3">
                      <p className="text-gray-700">{m.hours_used.toLocaleString('es-AR')} h</p>
                      {m.serial_number && <p className="text-xs text-gray-400 font-mono mt-0.5">{m.serial_number}</p>}
                    </td>
                    <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[m.status]}`}>{STATUS_LABEL[m.status] ?? m.status}</span></td>
                    <td className="px-3 py-3 text-right"><button onClick={() => startEdit(m)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
                  </tr>
                ))
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
