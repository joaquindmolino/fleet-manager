import { useEffect, useState } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { errorBus, type AppError } from '@/lib/errorBus'

const MAX_TOASTS = 4
const AUTO_DISMISS_MS = 10_000

export default function Toaster() {
  const [errors, setErrors] = useState<AppError[]>([])

  useEffect(() => {
    errorBus.subscribe((err) => {
      setErrors((prev) => [err, ...prev].slice(0, MAX_TOASTS))
      setTimeout(() => {
        setErrors((prev) => prev.filter((e) => e.id !== err.id))
      }, AUTO_DISMISS_MS)
    })
    return () => errorBus.unsubscribe()
  }, [])

  if (errors.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {errors.map((err) => (
        <div
          key={err.id}
          className="bg-white border border-red-200 rounded-xl shadow-lg px-4 py-3 pointer-events-auto"
        >
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {err.status && (
                  <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                    {err.status}
                  </span>
                )}
                <p className="text-sm font-medium text-gray-900 truncate">{err.detail}</p>
              </div>
              {err.endpoint && (
                <p className="text-xs text-gray-400 mt-0.5 font-mono truncate">{err.endpoint}</p>
              )}
            </div>
            <button
              onClick={() => setErrors((prev) => prev.filter((e) => e.id !== err.id))}
              className="text-gray-300 hover:text-gray-500 transition-colors shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
