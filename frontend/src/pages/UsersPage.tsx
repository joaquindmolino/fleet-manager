import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ShieldAlert, UserCog, KeyRound, ToggleLeft, ToggleRight } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'
import type { PaginatedResponse, User, Role } from '@/types'

const CI = 'border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 w-full min-w-0'
const CS = CI + ' bg-white'

interface UF { full_name: string; email: string; password: string; role_id: string }
const EMPTY: UF = { full_name: '', email: '', password: '', role_id: '' }
interface PasswordForm { password: string; confirm: string }

export default function UsersPage() {
  const { user: me, isLoading: authLoading } = useAuth()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Omit<UF, 'password'>>({ full_name: '', email: '', role_id: '' })
  const [addingRow, setAddingRow] = useState(false)
  const [addForm, setAddForm] = useState<UF>(EMPTY)
  const [passwordTarget, setPasswordTarget] = useState<User | null>(null)
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({ password: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')

  const isSuperadmin = !authLoading && !!me?.is_superadmin

  const { data, isLoading } = useQuery({
    queryKey: ['users', page],
    queryFn: () => api.get<PaginatedResponse<User>>(`/users?page=${page}&size=20`).then(r => r.data),
    enabled: isSuperadmin,
  })
  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/users/roles').then(r => r.data),
    staleTime: 60_000,
    enabled: isSuperadmin,
  })
  const roleMap = Object.fromEntries((roles ?? []).map(r => [r.id, r]))

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post('/users', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setAddingRow(false); setAddForm(EMPTY) },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api.patch(`/users/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setEditingId(null) },
  })
  const passwordMutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.patch(`/users/${id}/password`, { password }),
    onSuccess: () => { setPasswordTarget(null); setPasswordForm({ password: '', confirm: '' }) },
    onError: () => setPasswordError('No se pudo cambiar la contraseña.'),
  })

  if (authLoading) return <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div>
  if (!me?.is_superadmin) return <Navigate to="/dashboard" replace />

  function startEdit(u: User) {
    setAddingRow(false); setEditingId(u.id)
    setEditForm({ full_name: u.full_name, email: u.email, role_id: u.role_id ?? '' })
  }
  function ef(k: keyof typeof editForm, v: string) { setEditForm(p => ({ ...p, [k]: v })) }
  function af(k: keyof UF, v: string) { setAddForm(p => ({ ...p, [k]: v })) }

  function toggleActive(u: User) {
    if (u.id === me.id) return
    updateMutation.mutate({ id: u.id, body: { is_active: !u.is_active } })
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    if (passwordForm.password.length < 6) { setPasswordError('Mínimo 6 caracteres.'); return }
    if (passwordForm.password !== passwordForm.confirm) { setPasswordError('Las contraseñas no coinciden.'); return }
    if (!passwordTarget) return
    passwordMutation.mutate({ id: passwordTarget.id, password: passwordForm.password })
  }

  const isPending = createMutation.isPending || updateMutation.isPending
  const row = 'border-b border-gray-50 hover:bg-gray-50 transition-colors'
  const editRow = 'border-b border-blue-200 bg-blue-50'
  const addRow = 'border-b border-green-200 bg-green-50'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administración de usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">{data?.total ?? '—'} usuarios en el sistema</p>
        </div>
        <button onClick={() => { setAddingRow(true); setEditingId(null); setAddForm(EMPTY) }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"><Plus size={16} /> Crear usuario</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? <div className="p-12 text-center text-gray-400 text-sm">Cargando...</div> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Nombre', 'Email', 'Contraseña', 'Rol', 'Estado', ''].map(h => (
                  <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {addingRow && (
                <tr className={addRow}>
                  <form id="add-u" onSubmit={e => {
                    e.preventDefault()
                    if (addForm.password.length < 6) return
                    createMutation.mutate({ full_name: addForm.full_name, email: addForm.email, password: addForm.password, role_id: addForm.role_id || null })
                  }} />
                  <td className="px-3 py-2"><input form="add-u" required value={addForm.full_name} onChange={e => af('full_name', e.target.value)} placeholder="Nombre *" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-u" required type="email" value={addForm.email} onChange={e => af('email', e.target.value)} placeholder="email@empresa.com *" className={CI} /></td>
                  <td className="px-3 py-2"><input form="add-u" required type="password" minLength={6} value={addForm.password} onChange={e => af('password', e.target.value)} placeholder="Mínimo 6 chars *" className={CI} /></td>
                  <td className="px-3 py-2">
                    <select form="add-u" value={addForm.role_id} onChange={e => af('role_id', e.target.value)} className={CS}>
                      <option value="">Sin rol</option>
                      {(roles ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-gray-400 text-xs">Activo</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button form="add-u" type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                      <button type="button" onClick={() => setAddingRow(false)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                    </div>
                  </td>
                </tr>
              )}

              {data?.items.length === 0 && !addingRow
                ? <tr><td colSpan={6} className="p-12 text-center"><UserCog size={32} className="text-gray-300 mx-auto mb-3" /><p className="text-gray-500 text-sm">No hay usuarios registrados.</p></td></tr>
                : data?.items.map(u => {
                  const isMe = u.id === me.id
                  const role = u.role_id ? roleMap[u.role_id] : null
                  return editingId === u.id ? (
                    <tr key={u.id} className={editRow}>
                      <form id={`e-${u.id}`} onSubmit={e => { e.preventDefault(); updateMutation.mutate({ id: u.id, body: { full_name: editForm.full_name, email: editForm.email, role_id: editForm.role_id || null } }) }} />
                      <td className="px-3 py-2"><input form={`e-${u.id}`} required value={editForm.full_name} onChange={e => ef('full_name', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2"><input form={`e-${u.id}`} required type="email" value={editForm.email} onChange={e => ef('email', e.target.value)} className={CI} /></td>
                      <td className="px-3 py-2 text-gray-400 text-xs">—</td>
                      <td className="px-3 py-2">
                        <select form={`e-${u.id}`} value={editForm.role_id} onChange={e => ef('role_id', e.target.value)} className={CS}>
                          <option value="">Sin rol</option>
                          {(roles ?? []).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{u.is_active ? 'Activo' : 'Inactivo'}</span></td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button form={`e-${u.id}`} type="submit" disabled={isPending} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">Guardar</button>
                          <button type="button" onClick={() => setEditingId(null)} className="text-xs border border-gray-200 px-2 py-1 rounded hover:bg-gray-50">Cancelar</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={u.id} className={row}>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        {u.full_name}
                        {u.is_superadmin && <span className="ml-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 font-medium"><ShieldAlert size={10} /> Admin</span>}
                        {isMe && <span className="ml-2 text-xs text-gray-400">(vos)</span>}
                      </td>
                      <td className="px-3 py-3 text-gray-500">{u.email}</td>
                      <td className="px-3 py-3">
                        <button onClick={() => { setPasswordTarget(u); setPasswordForm({ password: '', confirm: '' }); setPasswordError('') }} title="Cambiar contraseña" className="text-gray-400 hover:text-gray-700 transition-colors">
                          <KeyRound size={14} />
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {role
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">{role.name}</span>
                          : <span className="text-gray-300 text-xs">Sin rol</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{u.is_active ? 'Activo' : 'Inactivo'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <button onClick={() => startEdit(u)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Editar</button>
                          {!isMe && (
                            <button onClick={() => toggleActive(u)} title={u.is_active ? 'Desactivar' : 'Activar'} className={`transition-colors ${u.is_active ? 'text-green-500 hover:text-red-500' : 'text-gray-300 hover:text-green-500'}`}>
                              {u.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                          )}
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

      {passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Cambiar contraseña</h2>
              <button onClick={() => setPasswordTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <form onSubmit={handlePasswordSubmit} className="p-5 space-y-4">
              <p className="text-sm text-gray-600">Usuario: <span className="font-medium">{passwordTarget.full_name}</span></p>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nueva contraseña *</label>
                <input required type="password" value={passwordForm.password} onChange={e => setPasswordForm(p => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Confirmar contraseña *</label>
                <input required type="password" value={passwordForm.confirm} onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Repetí la contraseña" />
              </div>
              {passwordError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{passwordError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setPasswordTarget(null)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Cancelar</button>
                <button type="submit" disabled={passwordMutation.isPending} className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 transition-colors">
                  {passwordMutation.isPending ? 'Guardando...' : 'Cambiar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
