import { createContext, useContext, useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  })

  async function fetchUser() {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setState({ user: null, isLoading: false, isAuthenticated: false })
      return
    }
    try {
      const res = await api.get<User>('/auth/me')
      setState({ user: res.data, isLoading: false, isAuthenticated: true })
    } catch {
      localStorage.removeItem('access_token')
      setState({ user: null, isLoading: false, isAuthenticated: false })
    }
  }

  useEffect(() => { fetchUser() }, [])

  async function login(email: string, password: string) {
    const res = await api.post<{ access_token: string }>('/auth/login', { email, password })
    localStorage.setItem('access_token', res.data.access_token)
    const me = await api.get<User>('/auth/me')
    setState({ user: me.data, isLoading: false, isAuthenticated: true })
  }

  function logout() {
    localStorage.removeItem('access_token')
    setState({ user: null, isLoading: false, isAuthenticated: false })
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ ...state, login, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext debe usarse dentro de AuthProvider')
  return ctx
}
