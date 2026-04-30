import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Building2 } from 'lucide-react'
import { api } from '@/lib/api'
import type { PaginatedResponse, Client } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'

interface CF {
  name: string
  contact_name: string
  contact_phone: string
  contact_email: string
  address: string
  notes: string
}
const EMPTY: CF = { name: '', contact_name: '', contact_phone: '', contact_email: '', address: '', notes: '' }

function toBody(f: CF) {
  return {
    name: f.name,
    contact_name: f.contact_name || null,
    contact_phone: f.contact_phone || null,
    contact_email: f.contact_email || null,
    address: f.address || null,
    notes: f.notes || null,
  }
}

export default function ClientsPage() {
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<CF>(EMPTY)
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<CF>(EMPTY)

  const { data, isLoading } = useQuery({
    queryKey: ['clients', page],
    queryFn: () => api.get<PaginatedResponse<Client>>(`/clients?page=${page}&size=20`).then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/clients', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setAddingRow(false); setAddForm(EMPTY) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/clients/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setEditingId(null) },
  })

  function startEdit(c: Client) {
    setAddingRow(false); setEditingId(c.id)
    setEditForm({
      name: c.name,
      contact_name: c.contact_name ?? '',
      contact_phone: c.contact_phone ?? '',
      contact_email: c.contact_email ?? '',
      address: c.address ?? '',
      notes: c.notes ?? '',
    })
  }
  function ef(k: keyof CF, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof CF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }
  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

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
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} clientes registrados</p>
        </div>
        <button
          onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Agregar cliente</span>
          <span className="sm:hidden">Agregar</span>
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre', 'Contacto', 'Teléfono', 'Email', 'Dirección', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-c" onSubmit={e => { e.preventDefault(); createMutation.mutate(toBody(addForm)) }} />
                  <td className="px-3 py-2"><input form="add-c" required value={addForm.name} onChange={e => af('name', e.target.value)} placeholder="Nombre *" className={CI} autoFocus /></td>
                  <td className="px-3 py-2"><input form="add-c" value={addForm.contact_name} onChange={e => af('contact_name', e.target.value)} placeholder="Contacto" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-c" value={addForm.contact_phone} onChange={e => af('contact_phone', e.target.value)} placeholder="Teléfono" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-c" type="email" value={addForm.contact_email} onChange={e => af('contact_email', e.target.value)} placeholder="Email" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-c" value={addForm.address} onChange={e => af('address', e.target.value)} placeholder="Dirección" className={CI} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-c" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No hay clientes registrados.</p>
                  </td>
                </tr>
              ) : data?.items.map(c => editingId === c.id ? (
                <tr key={c.id} className={editRow}>
                  <form id={`e-${c.id}`} onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: c.id, body: toBody(editForm) }) }} />
                  <td className="px-3 py-2"><input form={`e-${c.id}`} required value={editForm.name} onChange={e => ef('name', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2"><input form={`e-${c.id}`} value={editForm.contact_name} onChange={e => ef('contact_name', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2"><input form={`e-${c.id}`} value={editForm.contact_phone} onChange={e => ef('contact_phone', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2"><input form={`e-${c.id}`} type="email" value={editForm.contact_email} onChange={e => ef('contact_email', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2"><input form={`e-${c.id}`} value={editForm.address} onChange={e => ef('address', e.target.value)} className={CI} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form={`e-${c.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className={row}>
                  <td className="px-3 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-3 py-3 text-gray-500">{c.contact_name ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-500">{c.contact_phone ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-500">{c.contact_email ?? '—'}</td>
                  <td className="px-3 py-3 text-gray-500">{c.address ?? '—'}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => startEdit(c)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
                  </td>
                </tr>
              ))}
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
            <p className="text-xs font-semibold text-green-700 mb-3 uppercase tracking-wide">Nuevo cliente</p>
            <form onSubmit={e => { e.preventDefault(); createMutation.mutate(toBody(addForm)) }} className="space-y-2">
              <input required value={addForm.name} onChange={e => af('name', e.target.value)} placeholder="Nombre *" className={CI} autoFocus />
              <input value={addForm.contact_name} onChange={e => af('contact_name', e.target.value)} placeholder="Persona de contacto" className={CI} />
              <div className="grid grid-cols-2 gap-2">
                <input value={addForm.contact_phone} onChange={e => af('contact_phone', e.target.value)} placeholder="Teléfono" className={CI} />
                <input type="email" value={addForm.contact_email} onChange={e => af('contact_email', e.target.value)} placeholder="Email" className={CI} />
              </div>
              <input value={addForm.address} onChange={e => af('address', e.target.value)} placeholder="Dirección" className={CI} />
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setAddingRow(false)} className="flex-1 border border-gray-200 text-sm py-2 rounded-lg text-gray-600">Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {data?.items.length === 0 && !addingRow && (
          <div className="text-center py-12">
            <Building2 size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay clientes registrados.</p>
          </div>
        )}

        {data?.items.map(c => editingId === c.id ? (
          <div key={c.id} className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-700 mb-3 uppercase tracking-wide">Editando {c.name}</p>
            <form onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: c.id, body: toBody(editForm) }) }} className="space-y-2">
              <input required value={editForm.name} onChange={e => ef('name', e.target.value)} className={CI} />
              <input value={editForm.contact_name} onChange={e => ef('contact_name', e.target.value)} placeholder="Persona de contacto" className={CI} />
              <div className="grid grid-cols-2 gap-2">
                <input value={editForm.contact_phone} onChange={e => ef('contact_phone', e.target.value)} placeholder="Teléfono" className={CI} />
                <input type="email" value={editForm.contact_email} onChange={e => ef('contact_email', e.target.value)} placeholder="Email" className={CI} />
              </div>
              <input value={editForm.address} onChange={e => ef('address', e.target.value)} placeholder="Dirección" className={CI} />
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isPending} className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg disabled:opacity-50">Guardar</button>
                <button type="button" onClick={() => setEditingId(null)} className="flex-1 border border-gray-200 text-sm py-2 rounded-lg text-gray-600">Cancelar</button>
              </div>
            </form>
          </div>
        ) : (
          <div key={c.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium text-gray-900">{c.name}</p>
              {c.contact_name && <p className="text-sm text-gray-500 mt-0.5">{c.contact_name}</p>}
              {c.contact_phone && <p className="text-sm text-gray-500 mt-0.5">{c.contact_phone}</p>}
              {c.contact_email && <p className="text-xs text-gray-400 truncate">{c.contact_email}</p>}
              {c.address && <p className="text-xs text-gray-400 mt-0.5">{c.address}</p>}
            </div>
            <button onClick={() => startEdit(c)} className="text-xs text-blue-600 font-medium shrink-0">Editar</button>
          </div>
        ))}

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
