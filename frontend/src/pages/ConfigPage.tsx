import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Minus, ShieldCheck } from 'lucide-react'
import { api } from '@/lib/api'
import type { Role } from '@/types'

const MODULES = [
  { key: 'vehiculos',     label: 'Vehículos',              note: '' },
  { key: 'conductores',   label: 'Conductores',             note: '' },
  { key: 'maquinas',      label: 'Máquinas',                note: '' },
  { key: 'mantenimiento', label: 'Mantenimiento',           note: 'incluye Órdenes de trabajo y Neumáticos' },
  { key: 'viajes',        label: 'Viajes',                  note: '' },
  { key: 'proveedores',   label: 'Proveedores',             note: '' },
  { key: 'clientes',      label: 'Clientes',                note: '' },
  { key: 'gps',           label: 'Satelital',               note: '' },
  { key: 'reportes',      label: 'Reportes',                note: '' },
  { key: 'usuarios',      label: 'Usuarios',                note: 'solo superadmin' },
  { key: 'configuracion', label: 'Configuración',           note: '' },
]

const ACTIONS = [
  { key: 'ver', label: 'Ver' },
  { key: 'crear', label: 'Crear' },
  { key: 'editar', label: 'Editar' },
  { key: 'aprobar', label: 'Aprobar' },
  { key: 'cerrar', label: 'Cerrar' },
  { key: 'eliminar', label: 'Eliminar' },
]

function buildPermSet(role: Role): Set<string> {
  const s = new Set<string>()
  for (const p of role.permissions) s.add(`${p.module}:${p.action}`)
  return s
}

export default function ConfigPage() {
  const qc = useQueryClient()
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
      // Re-sync matrix from fresh data after invalidation
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-sm text-gray-500 mt-0.5">Permisos base de cada rol del sistema</p>
      </div>

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
                            <p className="font-medium text-gray-700">{mod.label}</p>
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
    </div>
  )
}
