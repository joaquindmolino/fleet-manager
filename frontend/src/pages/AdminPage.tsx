import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, LogIn, ToggleLeft, ToggleRight, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/useAuth'

interface TenantRow {
  id: string
  name: string
  slug: string
  plan: string
  is_active: boolean
  created_at: string
  user_count: number
}

const PLAN_LABEL: Record<string, string> = {
  trial: 'Trial',
  basic: 'Basic',
  pro: 'Pro',
  enterprise: 'Enterprise',
}

const PLAN_COLOR: Record<string, string> = {
  trial: 'bg-gray-100 text-gray-600',
  basic: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  enterprise: 'bg-amber-100 text-amber-700',
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  plan: 'trial' as const,
  admin_username: '',
  admin_email: '',
  admin_nombre: '',
  admin_password: '',
}

function slugify(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50)
}

export default function AdminPage() {
  const { impersonate } = useAuth()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [slugManual, setSlugManual] = useState(false)
  const [formError, setFormError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => api.get<TenantRow[]>('/admin/tenants').then(r => r.data),
  })

  const createMutation = useMutation({
    mutationFn: (body: typeof EMPTY_FORM) => api.post('/admin/tenants', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'tenants'] })
      setShowForm(false)
      setForm(EMPTY_FORM)
      setSlugManual(false)
      setFormError('')
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setFormError(err?.response?.data?.detail ?? 'Error al crear la empresa')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/tenants/${id}/toggle`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
  })

  async function handleImpersonate(tenant: TenantRow) {
    await impersonate(tenant.id, tenant.name)
    window.location.href = '/dashboard'
  }

  function handleNameChange(name: string) {
    setForm(f => ({ ...f, name, slug: slugManual ? f.slug : slugify(name) }))
  }

  function handleSlugChange(slug: string) {
    setSlugManual(true)
    setForm(f => ({ ...f, slug }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    // Email es opcional: si está vacío, mandamos null para que Pydantic no
    // lo rechace como "no es un email válido".
    const body = { ...form, admin_email: form.admin_email.trim() || null }
    createMutation.mutate(body as unknown as typeof EMPTY_FORM)
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Panel de administración</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestión global de empresas</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setFormError('') }}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <Plus size={16} />
          Nueva empresa
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-blue-200 p-5 mb-6 space-y-4">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Building2 size={16} className="text-blue-500" />
            Nueva empresa
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de la empresa *</label>
              <input
                required
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Logística ABC"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Slug (identificador único) *</label>
              <input
                required
                value={form.slug}
                onChange={e => handleSlugChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="logistica-abc"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Plan</label>
              <select
                value={form.plan}
                onChange={e => setForm(f => ({ ...f, plan: e.target.value as typeof form.plan }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Administrador inicial</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo *</label>
                <input
                  required
                  value={form.admin_nombre}
                  onChange={e => setForm(f => ({ ...f, admin_nombre: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan García"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Usuario *</label>
                <input
                  required
                  type="text"
                  value={form.admin_username}
                  onChange={e => setForm(f => ({ ...f, admin_username: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="jgarcia"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email (opcional)</label>
                <input
                  type="email"
                  value={form.admin_email}
                  onChange={e => setForm(f => ({ ...f, admin_email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="admin@empresa.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña inicial *</label>
                <input
                  required
                  type="text"
                  value={form.admin_password}
                  onChange={e => setForm(f => ({ ...f, admin_password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="mínimo 6 caracteres"
                />
              </div>
            </div>
          </div>

          {formError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setShowForm(false); setFormError('') }}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={createMutation.isPending}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors">
              {createMutation.isPending ? 'Creando...' : 'Crear empresa'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Cargando...</div>
        ) : tenants.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No hay empresas registradas.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {tenants.map(t => (
              <div key={t.id}>
                <div className="px-5 py-4 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{t.name}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLOR[t.plan]}`}>
                        {PLAN_LABEL[t.plan]}
                      </span>
                      {!t.is_active && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                          Inactiva
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 font-mono">{t.slug} · {t.user_count} usuario{t.user_count !== 1 ? 's' : ''}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                      className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                      title="Detalles"
                    >
                      {expanded === t.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                      onClick={() => toggleMutation.mutate(t.id)}
                      disabled={toggleMutation.isPending}
                      className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                      title={t.is_active ? 'Desactivar' : 'Activar'}
                    >
                      {t.is_active
                        ? <ToggleRight size={18} className="text-green-500" />
                        : <ToggleLeft size={18} />}
                    </button>
                    {t.is_active && (
                      <button
                        onClick={() => handleImpersonate(t)}
                        className="flex items-center gap-1.5 ml-1 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <LogIn size={14} />
                        Entrar
                      </button>
                    )}
                  </div>
                </div>

                {expanded === t.id && (
                  <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 grid grid-cols-2 gap-2">
                    <div><span className="font-medium">ID:</span> <span className="font-mono">{t.id}</span></div>
                    <div><span className="font-medium">Creada:</span> {new Date(t.created_at).toLocaleDateString('es-AR')}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
