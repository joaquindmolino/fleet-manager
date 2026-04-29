import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Timer, X } from 'lucide-react'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import type { Machine, PaginatedResponse } from '@/types'

interface Props {
  onClose: () => void
}

const TYPE_LABEL: Record<string, string> = {
  autoelevador_gasoil: 'Autoelevador gasoil',
  apilador_electrico: 'Apilador eléctrico',
  otro: 'Otro',
}

export default function QuickHoursModal({ onClose }: Props) {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const isAdmin = can('configuracion', 'editar')

  const [machineId, setMachineId] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState('')

  const { data: machinesData } = useQuery({
    queryKey: ['machines', 1],
    queryFn: () => api.get<PaginatedResponse<Machine>>('/machines?page=1&size=200').then(r => r.data),
  })

  const machines = (machinesData?.items ?? []).filter(m => m.status !== 'baja')
  const selected = machines.find(m => m.id === machineId) ?? null

  const minHours = selected ? selected.hours_used : 0
  const maxHours = (selected && !isAdmin) ? selected.hours_used + 20 : undefined

  const mutation = useMutation({
    mutationFn: ({ id, hours_used }: { id: string; hours_used: number }) =>
      api.patch<Machine>(`/machines/${id}/hours`, { hours_used }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['machines'] })
      onClose()
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setError(err?.response?.data?.detail ?? 'No se pudo actualizar las horas')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!selected) return
    const val = parseInt(hours)
    if (isNaN(val)) { setError('Ingresá un número válido'); return }
    if (val < selected.hours_used) { setError(`Las horas no pueden ser menores a las actuales (${selected.hours_used} h)`); return }
    if (!isAdmin && val > selected.hours_used + 20) { setError(`Máximo 20 horas más que las actuales (${selected.hours_used} h)`); return }
    mutation.mutate({ id: selected.id, hours_used: val })
  }

  function handleMachineChange(id: string) {
    setMachineId(id)
    setHours('')
    setError('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-900">Actualizar horas</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-0.5">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Máquina *</label>
            <select
              required
              value={machineId}
              onChange={e => handleMachineChange(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Seleccioná una máquina</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name}{m.brand ? ` — ${m.brand}` : ''} · {TYPE_LABEL[m.machine_type] ?? m.machine_type}
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-500 flex items-center justify-between">
              <span>Horas actuales</span>
              <span className="font-semibold text-gray-800">{selected.hours_used.toLocaleString('es-AR')} h</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nuevas horas *
              {selected && !isAdmin && (
                <span className="ml-1 text-gray-400 font-normal">(máx. {selected.hours_used + 20} h)</span>
              )}
            </label>
            <input
              required
              type="number"
              value={hours}
              onChange={e => { setHours(e.target.value); setError('') }}
              min={minHours}
              max={maxHours}
              placeholder={selected ? `${selected.hours_used} o más` : '—'}
              disabled={!selected}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm border border-gray-200 rounded-lg py-2.5 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selected || !hours || mutation.isPending}
              className="flex-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 transition-colors"
            >
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
