import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Package } from 'lucide-react'
import { api } from '@/lib/api'
import type { PaginatedResponse, Supplier } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

const CATEGORIES = [
  { value: 'mecanica', label: 'Mecánica' }, { value: 'electricidad', label: 'Electricidad' },
  { value: 'neumaticos', label: 'Neumáticos' }, { value: 'repuestos', label: 'Repuestos' },
  { value: 'carroceria', label: 'Carrocería' }, { value: 'lubricantes', label: 'Lubricantes' },
  { value: 'gps', label: 'GPS' }, { value: 'otro', label: 'Otro' },
]
const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

interface SF { name: string; category: string; phone: string; email: string; address: string; tax_id: string; notes: string }
const EMPTY: SF = { name: '', category: 'mecanica', phone: '', email: '', address: '', tax_id: '', notes: '' }

function toBody(f: SF) {
  return { name: f.name, category: f.category, phone: f.phone || null, email: f.email || null, address: f.address || null, tax_id: f.tax_id || null, notes: f.notes || null }
}

export default function SuppliersPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<SF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<SF>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page],
    queryFn: () => api.get<PaginatedResponse<Supplier>>(`/suppliers?page=${page}&size=20`).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/suppliers', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setAddingRow(false); setAddForm(EMPTY) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/suppliers/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setEditingId(null) },
  })

  function startEdit(s: Supplier) {
    setAddingRow(false); setEditingId(s.id)
    setEditForm({ name: s.name, category: s.category, phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '', tax_id: s.tax_id ?? '', notes: s.notes ?? '' })
  }
  function ef(k: keyof SF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof SF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  function CatSelect({ form, value, onChange }: { form: string; value: string; onChange: (v:string)=>void }) {
    return <select form={form} value={value} onChange={e=>onChange(e.target.value)} className={CS}>{CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.label}</option>)}</select>
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-gray-900">Proveedores</h1><p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} proveedores registrados</p></div>
        <button onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"><Plus size={16} /> Agregar proveedor</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre','Rubro','Teléfono','Email','CUIT','Dirección',''].map(h=><th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-s" onSubmit={e=>{e.preventDefault();createMutation.mutate(toBody(addForm))}} />
                  <td className="px-3 py-2"><input form="add-s" required value={addForm.name} onChange={e=>af('name',e.target.value)} placeholder="Nombre *" className={CI}/></td>
                  <td className="px-3 py-2"><CatSelect form="add-s" value={addForm.category} onChange={v=>af('category',v)}/></td>
                  <td className="px-3 py-2"><input form="add-s" value={addForm.phone} onChange={e=>af('phone',e.target.value)} placeholder="Teléfono" className={CI}/></td>
                  <td className="px-3 py-2"><input form="add-s" type="email" value={addForm.email} onChange={e=>af('email',e.target.value)} placeholder="Email" className={CI}/></td>
                  <td className="px-3 py-2"><input form="add-s" value={addForm.tax_id} onChange={e=>af('tax_id',e.target.value)} placeholder="20-12345678-9" className={CI}/></td>
                  <td className="px-3 py-2"><input form="add-s" value={addForm.address} onChange={e=>af('address',e.target.value)} placeholder="Dirección" className={CI}/></td>
                  <td className="px-3 py-2"><div className="flex gap-1"><button form="add-s" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={()=>setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow
                ? <tr><td colSpan={7} className="p-12 text-center"><Package size={32} className="text-gray-300 mx-auto mb-3"/><p className="text-gray-500 text-sm">No hay proveedores registrados.</p></td></tr>
                : data?.items.map(s => editingId === s.id ? (
                  <tr key={s.id} className={editRow}>
                    <form id={`e-${s.id}`} onSubmit={e=>{e.preventDefault();updateMutation.mutate({id:s.id,body:toBody(editForm)})}} />
                    <td className="px-3 py-2"><input form={`e-${s.id}`} required value={editForm.name} onChange={e=>ef('name',e.target.value)} className={CI}/></td>
                    <td className="px-3 py-2"><CatSelect form={`e-${s.id}`} value={editForm.category} onChange={v=>ef('category',v)}/></td>
                    <td className="px-3 py-2"><input form={`e-${s.id}`} value={editForm.phone} onChange={e=>ef('phone',e.target.value)} className={CI}/></td>
                    <td className="px-3 py-2"><input form={`e-${s.id}`} type="email" value={editForm.email} onChange={e=>ef('email',e.target.value)} className={CI}/></td>
                    <td className="px-3 py-2"><input form={`e-${s.id}`} value={editForm.tax_id} onChange={e=>ef('tax_id',e.target.value)} className={CI}/></td>
                    <td className="px-3 py-2"><input form={`e-${s.id}`} value={editForm.address} onChange={e=>ef('address',e.target.value)} className={CI}/></td>
                    <td className="px-3 py-2"><div className="flex gap-1"><button form={`e-${s.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button><button type="button" onClick={()=>setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button></div></td>
                  </tr>
                ) : (
                  <tr key={s.id} className={row}>
                    <td className="px-3 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-3 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{CAT_LABEL[s.category]??s.category}</span></td>
                    <td className="px-3 py-3 text-gray-500">{s.phone??'—'}</td>
                    <td className="px-3 py-3 text-gray-500">{s.email??'—'}</td>
                    <td className="px-3 py-3 text-gray-500 font-mono text-xs">{s.tax_id??'—'}</td>
                    <td className="px-3 py-3 text-gray-500">{s.address??'—'}</td>
                    <td className="px-3 py-3 text-right"><button onClick={()=>startEdit(s)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button></td>
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
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <button disabled={page===data.pages} onClick={()=>setPage(p=>p+1)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
