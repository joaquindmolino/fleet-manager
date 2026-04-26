export interface AppError {
  id: number
  status: number | null
  detail: string
  endpoint: string
}

type Handler = (err: AppError) => void
let handler: Handler | null = null
let seq = 0

export const errorBus = {
  subscribe: (h: Handler) => { handler = h },
  unsubscribe: () => { handler = null },
  emit: (err: Omit<AppError, 'id'>) => handler?.({ ...err, id: ++seq }),
}
