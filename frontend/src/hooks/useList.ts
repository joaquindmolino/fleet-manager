import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PaginatedResponse } from '@/types'

export function useList<T>(key: string, path: string, size = 100) {
  return useQuery({
    queryKey: [key, 'all'],
    queryFn: () =>
      api.get<PaginatedResponse<T>>(`${path}?page=1&size=${size}`).then((r) => r.data.items),
  })
}
