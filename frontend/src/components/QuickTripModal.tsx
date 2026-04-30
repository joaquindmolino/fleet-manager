import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { X, Truck, MapPin } from 'lucide-react'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import type { Driver, Trip, Client, PaginatedResponse } from '@/types'

interface VehicleBasic {
  id: string
  plate: string
  brand: string
  model: string
  odometer: number
}

interface Props {
  driver: Driver
  vehicle: VehicleBasic
  onClose: () => void
}

interface Form {
  associated_document: string
  stops_count: string
  start_odometer: string
  client_id: string
  notes: string
}

const EMPTY: Form = { associated_document: '', stops_count: '', start_odometer: '', client_id: '', notes: '' }

export default function QuickTripModal({ driver, vehicle, onClose }: Props) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { can } = usePermissions()
  const canSeeClients = can('clientes', 'ver')
  const [form, setForm] = useState<Form>(EMPTY)

  const { data: clients } = useQuery({
    queryKey: ['clients', 'all'],
    queryFn: () => api.get<PaginatedResponse<Client>>('/clients?page=1&size=200').then(r => r.data.items),
    enabled: canSeeClients,
  })

  const mutation = useMutation({
    mutationFn: (body: object) => api.post<Trip>('/trips/quick', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate('/delivery')
    },
  })

  function f(k: keyof Form, v: string) { setForm(p => ({ ...p, [k]: v })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      associated_document: form.associated_document,
      stops_count: form.stops_count ? parseInt(form.stops_count) : null,
      start_odometer: form.start_odometer ? parseInt(form.start_odometer) : null,
      client_id: form.client_id || null,
      notes: form.notes || null,
    })
  }

  const CI = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Registrar reparto</h2>
            <p className="text-xs text-gray-400 mt-0.5">Carga rápida del día</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>

        {/* Info del conductor/vehículo */}
        <div className="mx-6 mb-5 bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
          <Truck size={18} className="text-blue-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{driver.full_name}</p>
            <p className="text-xs text-gray-400 truncate">
              {vehicle.plate} — {vehicle.brand} {vehicle.model}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">

            {/* Documento asociado */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Documento asociado <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                value={form.associated_document}
                onChange={e => f('associated_document', e.target.value)}
                placeholder="Remito, factura, código de cliente…"
                className={CI}
                autoFocus
              />
            </div>

            {/* Cliente */}
            {canSeeClients && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Cliente
                </label>
                <select
                  value={form.client_id}
                  onChange={e => f('client_id', e.target.value)}
                  className={CI + ' bg-white'}
                >
                  <option value="">Sin cliente</option>
                  {clients?.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Paradas y Odómetro en fila */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Paradas
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.stops_count}
                  onChange={e => f('stops_count', e.target.value)}
                  placeholder="12"
                  className={CI}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                  Km odómetro
                </label>
                <input
                  type="number"
                  min={vehicle.odometer || 0}
                  value={form.start_odometer}
                  onChange={e => f('start_odometer', e.target.value)}
                  placeholder={vehicle.odometer ? String(vehicle.odometer) : '0'}
                  className={CI}
                />
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                Observaciones
              </label>
              <textarea
                value={form.notes}
                onChange={e => f('notes', e.target.value)}
                placeholder="Alguna novedad del viaje..."
                rows={3}
                className={CI + ' resize-none'}
              />
            </div>

            {mutation.isError && (
              <p className="text-xs text-red-600 text-center">
                {(mutation.error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Error al guardar. Intentá de nuevo.'}
              </p>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 text-sm border border-gray-200 rounded-xl py-3 font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={mutation.isPending}
                className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl py-3 transition-colors flex items-center justify-center gap-2"
              >
                {mutation.isPending ? (
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <MapPin size={15} />
                )}
                {mutation.isPending ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </form>
      </div>
    </div>
  )
}
