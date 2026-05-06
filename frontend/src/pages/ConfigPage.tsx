import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, ShieldCheck, Mail, Trash2, Plus } from 'lucide-react'
import { api } from '@/lib/api'
import type { Role } from '@/types'

const MODULES = [
  { key: 'vehiculos',       label: 'Vehículos',          note: '',                sub: false },
  { key: 'conductores',     label: 'Conductores',         note: '',                sub: false },
  { key: 'maquinas',        label: 'Máquinas',            note: '',                sub: false },
  { key: 'mantenimiento',   label: 'Mantenimiento',       note: '',                sub: false },
  { key: 'ordenes_trabajo', label: 'Órdenes de trabajo',  note: '',                sub: true  },
  { key: 'neumaticos',      label: 'Neumáticos',          note: '',                sub: true  },
  { key: 'viajes',          label: 'Viajes',              note: '',                sub: false },
  { key: 'proveedores',     label: 'Proveedores',         note: '',                sub: false },
  { key: 'clientes',        label: 'Clientes',            note: '',                sub: false },
  { key: 'gps',             label: 'Satelital',           note: '',                sub: false },
  { key: 'reportes',        label: 'Reportes',            note: '',                sub: false },
  { key: 'usuarios',        label: 'Usuarios',            note: 'solo superadmin', sub: false },
  { key: 'configuracion',   label: 'Configuración',       note: '',                sub: false },
]

const ACTIONS = [
  { key: 'ver', label: 'Ver' },
  { key: 'crear', label: 'Crear' },
  { key: 'editar', label: 'Editar' },
  { key: 'aprobar', label: 'Aprobar' },
  { key: 'cerrar', label: 'Cerrar' },
  { key: 'eliminar', label: 'Eliminar' },
]

interface AlertEmailRecord { id: string; email: string; label: string | null }

function buildPermSet(role: Role): Set<string> {
  const s = new Set<string>()
  for (const p of role.permissions) s.add(`${p.module}:${p.action}`)
  return s
}

type Tab = 'roles' | 'alert_emails'

// ── Sub-sección: emails de alertas ────────────────────────────────────────────
function AlertEmailsTab() {
  const qc = useQueryClient()
  const [emailInput, setEmailInput] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data: alertEmails = [], isLoading } = useQuery({
    queryKey: ['alert-emails'],
    queryFn: () => api.get<AlertEmailRecord[]>('/alert-emails').then(r => r.data),
  })

  const addMutation = useMutation({
    mutationFn: (body: { email: string; label?: string }) => api.post('/alert-emails', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alert-emails'] })
      setEmailInput('')
      setLabelInput('')
      setFormError(null)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setFormError(err?.response?.data?.detail ?? 'No se pudo agregar el email.')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/alert-emails/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-emails'] }),
  })

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!emailInput.trim()) return
    addMutation.mutate({ email: emailInput.trim(), label: labelInput.trim() || undefined })
  }

  return (
    <div className="p-6 max-w-xl">
      <p className="text-sm text-gray-500 mb-6">
        Estos emails reciben el resumen diario de alertas de mantenimiento (neumáticos,
        services vencidos o próximos, licencias). Se suman a los usuarios con rol de
        Administrador o Encargado de mantenimiento.
      </p>

      {/* Formulario */}
      <form onSubmit={handleAdd} className="mb-6 bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Agregar email</p>
        <div className="flex gap-2">
          <input
            type="email"
            required
            value={emailInput}
            onChange={e => { setEmailInput(e.target.value); setFormError(null) }}
            placeholder="correo@empresa.com"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={labelInput}
            onChange={e => setLabelInput(e.target.value)}
            placeholder="Nombre / descripción (opcional)"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {formError && <p className="text-xs text-red-600">{formError}</p>}
        <button
          type="submit"
          disabled={addMutation.isPending || !emailInput.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={14} />
          {addMutation.isPending ? 'Agregando...' : 'Agregar'}
        </button>
      </form>

      {/* Lista */}
      {isLoading ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : alertEmails.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
          <Mail size={28} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">No hay emails adicionales configurados.</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden bg-white">
          {alertEmails.map(ae => (
            <div key={ae.id} className="flex items-center gap-3 px-4 py-3">
              <Mail size={15} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{ae.email}</p>
                {ae.label && <p className="text-xs text-gray-400 mt-0.5 truncate">{ae.label}</p>}
              </div>
              <button
                onClick={() => deleteMutation.mutate(ae.id)}
                disabled={deleteMutation.isPending}
                className="text-gray-300 hover:text-red-500 transition-colors shrink-0 disabled:opacity-40"
                title="Eliminar"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function ConfigPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('roles')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [matrix, setMatrix] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState(false)

  const { data: roles, isLoading } = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<Role[]>('/users/roles').then(r => r.data),
    staleTime: 60_000,
  })

  const selectedRole = roles?.find(r => r.id === selectedId) ?? null

  function selectRole(role: Role) {
    setSelectedId(role.id)
    setMatrix(buildPermSet(role))
    setDirty(false)
  }

  function toggle(mod: string, act: string) {
    const key = `${mod}:${act}`
    setMatrix(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setDirty(true)
  }

  const saveMutation = useMutation({
    mutationFn: ({ roleId, permissions }: { roleId: string; permissions: { module: string; action: string }[] }) =>
      api.patch(`/users/roles/${roleId}/permissions`, { permissions }),
    onSuccess: (_, { roleId }) => {
      qc.invalidateQueries({ queryKey: ['roles'] })
      qc.invalidateQueries({ queryKey: ['users'] })
      setDirty(false)
      const fresh = qc.getQueryData<Role[]>(['roles'])
      const freshRole = fresh?.find(r => r.id === roleId)
      if (freshRole) setMatrix(buildPermSet(freshRole))
    },
  })

  function handleSave() {
    if (!selectedId) return
    const permissions: { module: string; action: string }[] = []
    for (const key of matrix) {
      const [module, action] = key.split(':')
      permissions.push({ module, action })
    }
    saveMutation.mutate({ roleId: selectedId, permissions })
  }

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
        tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-0.5">Permisos de roles y alertas del sistema</p>
      </div>

      <div className="flex gap-1 mb-4 bg-gray-100 p-1 rounded-lg w-fit">
        {tabBtn('roles', 'Permisos de roles', <ShieldCheck size={14} />)}
        {tabBtn('alert_emails', 'Emails de alertas', <Mail size={14} />)}
      </div>

      {tab === 'alert_emails' ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="font-semibold text-gray-900 text-sm">Emails de alertas de mantenimiento</p>
            <p className="text-xs text-gray-400 mt-0.5">Destinatarios extra del resumen diario</p>
          </div>
          <AlertEmailsTab />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex min-h-96">
          {/* Lista de roles */}
          <div className="w-48 border-r border-gray-200 shrink-0 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Roles</p>
            </div>
            {isLoading
              ? <div className="p-4 text-sm text-gray-400">Cargando...</div>
              : (
                <div className="py-2 flex-1">
                  {(roles ?? []).map(r => (
                    <button
                      key={r.id}
                      onClick={() => selectRole(r)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${
                        r.id === selectedId
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <ShieldCheck size={13} className={r.id === selectedId ? 'text-blue-500' : 'text-gray-300'} />
                      {r.name}
                    </button>
                  ))}
                </div>
              )
            }
          </div>

          {/* Matriz de permisos */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {!selectedRole
              ? (
                <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                  Seleccioná un rol para editar sus permisos
                </div>
              )
              : (
                <>
                  <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between shrink-0">
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{selectedRole.name}</p>
                      {selectedRole.description && (
                        <p className="text-xs text-gray-400">{selectedRole.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {dirty && <span className="text-xs text-amber-600 font-medium">Cambios sin guardar</span>}
                      <button
                        onClick={handleSave}
                        disabled={!dirty || saveMutation.isPending}
                        className="text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-lg px-4 py-2 transition-colors"
                      >
                        {saveMutation.isPending ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto flex-1">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          <th className="text-left px-4 py-2 text-gray-500 font-semibold w-36">Módulo</th>
                          {ACTIONS.map(a => (
                            <th key={a.key} className="px-2 py-2 text-center text-gray-500 font-semibold">{a.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULES.map(mod => (
                          <tr key={mod.key} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5">
                              {mod.sub ? (
                                <p className="pl-5 text-gray-500 text-xs font-normal flex items-center gap-1">
                                  <span className="text-gray-300 select-none">└</span> {mod.label}
                                </p>
                              ) : (
                                <p className="font-medium text-gray-700">{mod.label}</p>
                              )}
                              {mod.note && <p className="text-xs text-gray-400 mt-0.5">{mod.note}</p>}
                            </td>
                            {ACTIONS.map(act => {
                              const key = `${mod.key}:${act.key}`
                              const has = matrix.has(key)
                              return (
                                <td key={act.key} className="px-2 py-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => toggle(mod.key, act.key)}
                                    title={has ? 'Quitar permiso' : 'Dar permiso'}
                                    className={`w-6 h-6 rounded cursor-pointer flex items-center justify-center mx-auto transition-colors ${
                                      has
                                        ? 'bg-green-500 hover:bg-green-600'
                                        : 'border border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                                    }`}
                                  >
                                    {has
                                      ? <Check size={11} className="text-white" />
                                      : <Minus size={11} className="text-gray-300" />
                                    }
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-5 text-xs text-gray-400 shrink-0">
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded bg-green-500 flex items-center justify-center shrink-0">
                        <Check size={9} className="text-white" />
                      </span>
                      Tiene acceso
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded border border-gray-200 flex items-center justify-center shrink-0">
                        <Minus size={9} className="text-gray-300" />
                      </span>
                      Sin acceso
                    </span>
                    <span className="ml-auto">Los permisos personalizados de usuarios individuales no se modifican</span>
                  </div>
                </>
              )
            }
          </div>
        </div>
      )}
    </div>
  )
}
