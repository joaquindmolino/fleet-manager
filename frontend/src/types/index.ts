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
  username: string
  email: string | null
  full_name: string
  is_active: boolean
  is_superadmin: boolean
  has_driver_profile: boolean
  has_machine_assigned: boolean
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
  assigned_user_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Alert {
  type: string
  severity: 'warning' | 'danger'
  entity_type: 'vehicle' | 'machine'
  entity_id: string
  entity_name: string
  title: string
  detail: string | null
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
  approval_status: 'pendiente' | 'aprobada' | 'rechazada'
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  scheduled_date: string | null
  due_date: string | null
  completed_date: string | null
  completed_at: string | null
  notes: string | null
  vehicle_plate: string | null
  machine_name: string | null
  assigned_to_name: string | null
  approved_by_name: string | null
}

export interface MaintenanceService {
  id: string
  tenant_id: string
  name: string
  description: string | null
  interval_km: number | null
  interval_hours: number | null
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

export interface Client {
  id: string
  tenant_id: string
  name: string
  contact_name: string | null
  contact_phone: string | null
  contact_email: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Trip {
  id: string
  tenant_id: string
  vehicle_id: string
  driver_id: string | null
  client_id: string | null
  name: string | null
  origin: string
  destination: string
  start_odometer: number | null
  end_odometer: number | null
  start_lat: number | null
  start_lng: number | null
  end_lat: number | null
  end_lng: number | null
  scheduled_date: string | null
  start_time: string | null
  end_time: string | null
  status: 'borrador' | 'pendiente' | 'planificado' | 'en_curso' | 'completado' | 'cancelado'
  notes: string | null
  associated_document: string | null
  stops_count: number | null
  planned_stops_count: number
  line_color: string | null
  share_token: string | null
  created_at: string
}

export interface TripStop {
  id: string
  trip_id: string
  lat: number
  lng: number
  accuracy: number | null
  notes: string | null
  timestamp: string
  is_extra: boolean
  created_at: string
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

export interface Notification {
  id: string
  tenant_id: string
  user_id: string
  notification_type: string
  title: string
  body: string | null
  link: string | null
  related_entity_type: string | null
  related_entity_id: string | null
  is_read: boolean
  sent_at: string | null
  created_at: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}
