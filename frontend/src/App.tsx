import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { usePermissions } from '@/hooks/usePermissions'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import VehiclesPage from '@/pages/VehiclesPage'
import DriversPage from '@/pages/DriversPage'
import MachinesPage from '@/pages/MachinesPage'
import MaintenancePage from '@/pages/MaintenancePage'
import TripsPage from '@/pages/TripsPage'
import SuppliersPage from '@/pages/SuppliersPage'
import WorkOrdersPage from '@/pages/WorkOrdersPage'
import TiresPage from '@/pages/TiresPage'
import UsersPage from '@/pages/UsersPage'
import ClientsPage from '@/pages/ClientsPage'
import SatellitePage from '@/pages/SatellitePage'
import GpsConfigPage from '@/pages/GpsConfigPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequirePermission({ module, action, children }: { module: string; action: string; children: React.ReactNode }) {
  const { isLoading } = useAuth()
  const { can } = usePermissions()
  if (isLoading) return null
  if (!can(module, action)) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="vehicles" element={<RequirePermission module="vehiculos" action="ver"><VehiclesPage /></RequirePermission>} />
          <Route path="drivers" element={<RequirePermission module="conductores" action="ver"><DriversPage /></RequirePermission>} />
          <Route path="machines" element={<RequirePermission module="maquinas" action="ver"><MachinesPage /></RequirePermission>} />
          <Route path="maintenance" element={<RequirePermission module="mantenimiento" action="ver"><MaintenancePage /></RequirePermission>} />
          <Route path="work-orders" element={<RequirePermission module="mantenimiento" action="ver"><WorkOrdersPage /></RequirePermission>} />
          <Route path="tires" element={<RequirePermission module="mantenimiento" action="ver"><TiresPage /></RequirePermission>} />
          <Route path="trips" element={<RequirePermission module="viajes" action="ver"><TripsPage /></RequirePermission>} />
          <Route path="suppliers" element={<RequirePermission module="proveedores" action="ver"><SuppliersPage /></RequirePermission>} />
          <Route path="clients" element={<RequirePermission module="clientes" action="ver"><ClientsPage /></RequirePermission>} />
          <Route path="satellite" element={<RequirePermission module="gps" action="ver"><SatellitePage /></RequirePermission>} />
          <Route path="gps-config" element={<RequirePermission module="configuracion" action="editar"><GpsConfigPage /></RequirePermission>} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
