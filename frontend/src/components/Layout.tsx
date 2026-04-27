import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import {
  Truck, Wrench, Route, Package, BarChart3,
  LogOut, User, Forklift, Users, ClipboardList, Circle, UserCog,
  Menu, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS: { to: string; label: string; icon: React.ElementType; perm?: [string, string] }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/vehicles', label: 'Vehículos', icon: Truck, perm: ['flota', 'ver'] },
  { to: '/drivers', label: 'Conductores', icon: Users, perm: ['flota', 'ver'] },
  { to: '/machines', label: 'Máquinas', icon: Forklift, perm: ['flota', 'ver'] },
  { to: '/maintenance', label: 'Mantenimiento', icon: Wrench, perm: ['mantenimiento', 'ver'] },
  { to: '/work-orders', label: 'Órdenes de trabajo', icon: ClipboardList, perm: ['mantenimiento', 'ver'] },
  { to: '/tires', label: 'Neumáticos', icon: Circle, perm: ['mantenimiento', 'ver'] },
  { to: '/trips', label: 'Viajes', icon: Route, perm: ['viajes', 'ver'] },
  { to: '/suppliers', label: 'Proveedores', icon: Package, perm: ['proveedores', 'ver'] },
]

const ADMIN_ITEMS = [
  { to: '/users', label: 'Usuarios', icon: UserCog },
]

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth()
  const { can } = usePermissions()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  const visibleItems = NAV_ITEMS.filter(item => !item.perm || can(item.perm[0], item.perm[1]))

  return (
    <div className="flex flex-col h-full">
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {user?.is_superadmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Administración</p>
            </div>
            {ADMIN_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )
                }
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-gray-100 p-3">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <User size={15} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{user?.full_name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="flex h-screen bg-gray-100">

      {/* Sidebar desktop */}
      <aside className="hidden md:flex w-56 bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="font-bold text-lg text-blue-600">Fleet Manager</span>
        </div>
        <SidebarContent />
      </aside>

      {/* Drawer móvil */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40 md:hidden"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-white z-50 flex flex-col shadow-xl md:hidden">
            <div className="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
              <span className="font-bold text-lg text-blue-600">Fleet Manager</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={20} />
              </button>
            </div>
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </>
      )}

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header móvil */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setDrawerOpen(true)}
            className="text-gray-600 hover:text-gray-900 p-1"
          >
            <Menu size={22} />
          </button>
          <span className="font-bold text-blue-600">Fleet Manager</span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
