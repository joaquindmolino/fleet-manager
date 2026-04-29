import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Truck, Wrench, Route, Users, PackageCheck, Timer } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import QuickTripModal from '@/components/QuickTripModal'
import QuickHoursModal from '@/components/QuickHoursModal'
import type { PaginatedResponse, WorkOrder, Driver } from '@/types'

interface MyDriver extends Driver {
  vehicle: { id: string; plate: string; brand: string; model: string; odometer: number } | null
}

interface DashboardStats {
  vehicles_activos: number
  ordenes_abiertas: number
  trips_en_curso: number
  choferes_activos: number
}

const PRIORITY_COLOR: Record<string, string> = {
  baja: 'bg-gray-100 text-gray-500',
  normal: 'bg-blue-100 text-blue-700',
  alta: 'bg-amber-100 text-amber-700',
  urgente: 'bg-red-100 text-red-700',
}
const PRIORITY_LABEL: Record<string, string> = {
  baja: 'Baja',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
}
const STATUS_COLOR: Record<string, string> = {
  abierta: 'bg-amber-100 text-amber-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-gray-100 text-gray-400',
}
const STATUS_LABEL: Record<string, string> = {
  abierta: 'Abierta',
  en_progreso: 'En progreso',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

function StatCard({ label, value, icon: Icon, color, to }: {
  label: string
  value: number | string
  icon: React.ElementType
  color: string
  to: string
}) {
  return (
    <Link to={to} className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </Link>
  )
}

export default function DashboardPage() {
  const { can } = usePermissions()
  const canSeeWorkOrders = can('mantenimiento', 'ver')
  const canUpdateHours = can('maquinas', 'editar')
  const [quickTripOpen, setQuickTripOpen] = useState(false)
  const [quickHoursOpen, setQuickHoursOpen] = useState(false)

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => api.get<DashboardStats>('/stats/dashboard').then((r) => r.data),
  })

  const { data: recentOrders } = useQuery({
    queryKey: ['work-orders', 'recent'],
    queryFn: () =>
      api
        .get<PaginatedResponse<WorkOrder>>('/work-orders?size=5&status_filter=abierta')
        .then((r) => r.data),
    enabled: canSeeWorkOrders,
  })

  const { data: myDriver } = useQuery({
    queryKey: ['drivers', 'me'],
    queryFn: () =>
      api.get<MyDriver>('/drivers/me').then(r => r.data).catch((err: { response?: { status?: number } }) => {
        if (err?.response?.status === 404) return null
        throw err
      }),
    retry: false,
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Estado general de la flota</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canUpdateHours && (
            <button
              onClick={() => setQuickHoursOpen(true)}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <Timer size={18} />
              Actualizar horas
            </button>
          )}
          {myDriver?.vehicle && (
            <button
              onClick={() => setQuickTripOpen(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors shadow-sm"
            >
              <PackageCheck size={18} />
              Registrar reparto
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Vehículos activos"
          value={loadingStats ? '—' : stats?.vehicles_activos ?? 0}
          icon={Truck}
          color="bg-blue-500"
          to="/vehicles"
        />
        <StatCard
          label="Órdenes abiertas"
          value={loadingStats ? '—' : stats?.ordenes_abiertas ?? 0}
          icon={Wrench}
          color="bg-amber-500"
          to="/maintenance"
        />
        <StatCard
          label="Viajes en curso"
          value={loadingStats ? '—' : stats?.trips_en_curso ?? 0}
          icon={Route}
          color="bg-green-500"
          to="/trips"
        />
        <StatCard
          label="Conductores activos"
          value={loadingStats ? '—' : stats?.choferes_activos ?? 0}
          icon={Users}
          color="bg-purple-500"
          to="/drivers"
        />
      </div>

      {quickTripOpen && myDriver && myDriver.vehicle && (
        <QuickTripModal driver={myDriver} vehicle={myDriver.vehicle} onClose={() => setQuickTripOpen(false)} />
      )}
      {quickHoursOpen && (
        <QuickHoursModal onClose={() => setQuickHoursOpen(false)} />
      )}

      {canSeeWorkOrders && <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Órdenes de trabajo abiertas</h2>
          <Link to="/work-orders" className="text-sm text-blue-600 hover:text-blue-800 font-medium">
            Ver todas →
          </Link>
        </div>

        {!recentOrders || recentOrders.items.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No hay órdenes de trabajo abiertas.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descripción</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Prioridad</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.items.map((order) => (
                <tr key={order.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-gray-800 max-w-xs truncate">{order.description}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[order.status]}`}>
                      {STATUS_LABEL[order.status] ?? order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLOR[order.priority]}`}>
                      {PRIORITY_LABEL[order.priority] ?? order.priority}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {order.due_date
                      ? new Date(order.due_date).toLocaleDateString('es-AR')
                      : <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  )
}
