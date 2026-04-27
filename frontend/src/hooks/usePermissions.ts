import { useAuth } from './useAuth'

export function usePermissions() {
  const { user } = useAuth()

  function can(module: string, action: string): boolean {
    if (!user) return false
    if (user.is_superadmin) return true
    return user.role?.permissions.some(p => p.module === module && p.action === action) ?? false
  }

  return { can }
}
