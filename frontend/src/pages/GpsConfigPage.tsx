import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Satellite, CheckCircle, AlertCircle, Loader } from 'lucide-react'
import { api } from '@/lib/api'

interface GpsConfig {
  id: string
  provider: string
  is_active: boolean
  username: string | null
  user_id: string | null
}

const CI = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow'

export default function GpsConfigPage() {
  const qc = useQueryClient()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saved, setSaved] = useState(false)

  const { data: config, isLoading } = useQuery({
    queryKey: ['gps-config'],
    queryFn: () => api.get<GpsConfig | null>('/gps/config').then(r => r.data),
  })

  const mutation = useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      api.post<GpsConfig>('/gps/config', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gps-config'] })
      setPassword('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({ username, password })
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Satellite size={24} className="text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración GPS</h1>
          <p className="text-sm text-gray-500 mt-0.5">Credenciales de PowerFleet para la vista satelital</p>
        </div>
      </div>

      {/* Estado actual */}
      {!isLoading && (
        <div className={`mb-6 rounded-xl border px-5 py-4 flex items-center gap-3 ${config ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          {config ? (
            <>
              <CheckCircle size={20} className="text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-800">Conectado</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Usuario: <span className="font-medium">{config.username}</span>
                  {' · '}UserID: <span className="font-mono">{config.user_id?.slice(0, 8)}…</span>
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={20} className="text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No configurado</p>
                <p className="text-xs text-amber-700 mt-0.5">Ingresá las credenciales para activar el mapa satelital</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Formulario */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          {config ? 'Actualizar credenciales' : 'Ingresar credenciales'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Usuario PowerFleet <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={config?.username ?? 'tu_usuario@empresa.com'}
              className={CI}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
              Contraseña <span className="text-red-500">*</span>
            </label>
            <input
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className={CI}
              autoComplete="current-password"
            />
          </div>

          <p className="text-xs text-gray-400">
            El UserID de PowerFleet se obtiene automáticamente al guardar. La contraseña se almacena de forma segura en el servidor.
          </p>

          {mutation.isError && (
            <p className="text-xs text-red-600">
              {(mutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Error al conectar con PowerFleet. Verificá las credenciales.'}
            </p>
          )}

          {saved && (
            <p className="text-xs text-green-600 font-medium">✓ Credenciales guardadas correctamente</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            {mutation.isPending ? (
              <>
                <Loader size={16} className="animate-spin" />
                Verificando credenciales…
              </>
            ) : (
              config ? 'Actualizar' : 'Guardar y conectar'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
