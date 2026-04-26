import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
  if (!isAuthenticated) return <Navigate to="/login" replace />
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
          <Route path="vehicles" element={<VehiclesPage />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="machines" element={<MachinesPage />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="trips" element={<TripsPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="work-orders" element={<WorkOrdersPage />} />
          <Route path="tires" element={<TiresPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
