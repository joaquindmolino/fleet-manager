import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Building2, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/lib/api'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<1 | 2>(1)
  const [slug, setSlug] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleTenantSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.get<{ name: string; slug: string }>(`/auth/tenant/${slug.trim().toLowerCase()}`)
      setTenantName(res.data.name)
      setStep(2)
    } catch {
      setError('Empresa no encontrada. Verificá el nombre ingresado.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(slug, email, password)
      navigate('/dashboard')
    } catch {
      setError('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  function handleBack() {
    setStep(1)
    setEmail('')
    setPassword('')
    setError('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Fleet Manager</h1>
          <p className="text-sm text-gray-500 mt-1">Gestión de flotas y mantenimiento</p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleTenantSubmit} className="bg-white shadow-sm rounded-xl p-6 space-y-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className="text-gray-400" />
              <p className="text-sm font-medium text-gray-700">Ingresá el nombre de tu empresa</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
              <input
                type="text"
                required
                autoFocus
                autoComplete="organization"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ej: logistica-abc"
              />
              <p className="text-xs text-gray-400 mt-1">El identificador único que te asignaron al registrarte.</p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !slug.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Verificando...' : (
                <>Continuar <ChevronRight size={16} /></>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLoginSubmit} className="bg-white shadow-sm rounded-xl p-6 space-y-4 border border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Building2 size={14} className="text-blue-500" />
                <span className="text-sm font-semibold text-blue-700">{tenantName}</span>
              </div>
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ArrowLeft size={12} />
                Cambiar
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="usuario@empresa.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg text-sm transition-colors"
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
