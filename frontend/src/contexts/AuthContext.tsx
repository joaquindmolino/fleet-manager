import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { User } from '@/types'

interface Impersonation {
  tenantId: string
  tenantName: string
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  impersonating: Impersonation | null
}

interface AuthContextValue extends AuthState {
  login: (tenantSlug: string, email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  impersonate: (tenantId: string, tenantName: string) => Promise<void>
  stopImpersonating: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    impersonating: null,
  })

  async function fetchUser(impersonating: Impersonation | null = null) {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setState({ user: null, isLoading: false, isAuthenticated: false, impersonating: null })
      return
    }
    try {
      const res = await api.get<User>('/auth/me')
      setState({ user: res.data, isLoading: false, isAuthenticated: true, impersonating })
    } catch {
      localStorage.removeItem('access_token')
      setState({ user: null, isLoading: false, isAuthenticated: false, impersonating: null })
    }
  }

  useEffect(() => {
    const imp = localStorage.getItem('impersonating')
    fetchUser(imp ? (JSON.parse(imp) as Impersonation) : null)
  }, [])

  async function login(tenantSlug: string, email: string, password: string) {
    const res = await api.post<{ access_token: string }>('/auth/login', {
      tenant_slug: tenantSlug,
      email,
      password,
    })
    localStorage.setItem('access_token', res.data.access_token)
    const me = await api.get<User>('/auth/me')
    setState({ user: me.data, isLoading: false, isAuthenticated: true, impersonating: null })
  }

  function logout() {
    localStorage.removeItem('access_token')
    localStorage.removeItem('original_token')
    localStorage.removeItem('impersonating')
    setState({ user: null, isLoading: false, isAuthenticated: false, impersonating: null })
    window.location.href = '/login'
  }

  async function impersonate(tenantId: string, tenantName: string) {
    const res = await api.post<{ access_token: string }>(`/admin/tenants/${tenantId}/impersonate`)
    localStorage.setItem('original_token', localStorage.getItem('access_token') ?? '')
    localStorage.setItem('access_token', res.data.access_token)
    const imp: Impersonation = { tenantId, tenantName }
    localStorage.setItem('impersonating', JSON.stringify(imp))
    await fetchUser(imp)
  }

  async function stopImpersonating() {
    const original = localStorage.getItem('original_token')
    if (original) localStorage.setItem('access_token', original)
    localStorage.removeItem('original_token')
    localStorage.removeItem('impersonating')
    await fetchUser(null)
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser: () => fetchUser(state.impersonating), impersonate, stopImpersonating }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext debe usarse dentro de AuthProvider')
  return ctx
}
