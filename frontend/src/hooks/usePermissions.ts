import { useAuth } from './useAuth'

export function usePermissions() {
  const { user } = useAuth()

  function can(module: string, action: string): boolean {
    if (!user) return false
    if (user.is_superadmin) return true

    // Override de usuario tiene precedencia sobre el rol
    const override = user.permission_overrides?.find(
      o => o.module === module && o.action === action
    )
    if (override !== undefined) return override.granted

    // Sin override: usar permisos del rol
    return user.role?.permissions.some(p => p.module === module && p.action === action) ?? false
  }

  return { can }
}
