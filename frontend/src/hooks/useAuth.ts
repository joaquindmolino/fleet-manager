import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isAuthenticated: false,
  })

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      setState({ user: null, isLoading: false, isAuthenticated: false })
      return
    }
    api.get<User>('/auth/me')
      .then((res) => setState({ user: res.data, isLoading: false, isAuthenticated: true }))
      .catch(() => {
        localStorage.removeItem('access_token')
        setState({ user: null, isLoading: false, isAuthenticated: false })
      })
  }, [])

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

  return { ...state, login, logout }
}
