export interface Tenant {
  id: string
  name: string
  slug: string
  plan: 'trial' | 'basic' | 'pro' | 'enterprise'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserPermissionOverride {
  permission_id: string
  module: string
  action: string
  granted: boolean
}

export interface User {
  id: string
  tenant_id: string
  role_id: string | null
  role: Role | null
  permission_overrides: UserPermissionOverride[]
  email: string
  full_name: string
  is_active: boolean
  is_superadmin: boolean
  created_at: string
  updated_at: string
}

export interface Vehicle {
  id: string
  tenant_id: string
  plate: string
  brand: string
  model: string
  year: number | null
  vehicle_type: 'camion' | 'camioneta' | 'auto' | 'otro'
  status: 'activo' | 'en_servicio' | 'baja'
  odometer: number
  documents: Record<string, unknown> | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Machine {
  id: string
  tenant_id: string
  name: string
  brand: string | null
  model: string | null
  year: number | null
  machine_type: 'autoelevador_gasoil' | 'apilador_electrico' | 'otro'
  status: 'activo' | 'en_servicio' | 'baja'
  serial_number: string | null
  hours_used: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Driver {
  id: string
  tenant_id: string
  user_id: string | null
  vehicle_id: string | null
  full_name: string
  license_number: string | null
  license_expiry: string | null
  phone: string | null
  status: 'activo' | 'inactivo' | 'baja'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  tenant_id: string
  name: string
  category: string
  phone: string | null
  email: string | null
  address: string | null
  tax_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WorkOrder {
  id: string
  tenant_id: string
  vehicle_id: string | null
  machine_id: string | null
  assigned_to: string | null
  description: string
  status: 'abierta' | 'en_progreso' | 'completada' | 'cancelada'
  priority: 'baja' | 'normal' | 'alta' | 'urgente'
  due_date: string | null
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface MaintenanceService {
  id: string
  tenant_id: string
  name: string
  description: string | null
  interval_km: number | null
  interval_days: number | null
  applies_to: 'vehiculo' | 'maquina' | 'ambos'
}

export interface MaintenanceRecord {
  id: string
  tenant_id: string
  vehicle_id: string | null
  machine_id: string | null
  service_id: string | null
  driver_id: string | null
  supplier_id: string | null
  work_order_id: string | null
  service_date: string
  odometer_at_service: number | null
  cost: string | null
  notes: string | null
}

export interface Trip {
  id: string
  tenant_id: string
  vehicle_id: string
  driver_id: string | null
  origin: string
  destination: string
  start_odometer: number | null
  end_odometer: number | null
  start_time: string | null
  end_time: string | null
  status: 'planificado' | 'en_curso' | 'completado' | 'cancelado'
  notes: string | null
  delivery_number: string | null
  stops_count: number | null
}

export interface Tire {
  id: string
  tenant_id: string
  vehicle_id: string
  position: string
  axle: number | null
  brand: string | null
  model: string | null
  size: string | null
  serial_number: string | null
  km_at_install: number
  km_limit: number | null
  current_km: number
  status: 'en_uso' | 'en_stock' | 'reencauchado' | 'descartado'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  module: string
  action: string
}

export interface Role {
  id: string
  tenant_id: string
  name: string
  description: string | null
  is_system: boolean
  permissions: Permission[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}
