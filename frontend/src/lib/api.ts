import axios from 'axios'
import { errorBus } from '@/lib/errorBus'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status: number | null = error.response?.status ?? null

    if (status === 401) {
      localStorage.removeItem('access_token')
      window.location.href = '/login'
      return Promise.reject(error)
    }

    // Endpoints que pueden devolver 404 de forma esperada — no mostrar error global
    const url = error.config?.url ?? ''
    if (status === 404 && url.includes('/drivers/me')) {
      return Promise.reject(error)
    }

    const rawDetail = error.response?.data?.detail
    const detail = Array.isArray(rawDetail)
      ? rawDetail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join(' · ')
      : rawDetail ?? error.message ?? 'Error desconocido'

    const method = (error.config?.method ?? '').toUpperCase()

    errorBus.emit({ status, detail, endpoint: `${method} ${url}` })

    return Promise.reject(error)
  },
)
