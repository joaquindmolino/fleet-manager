import { useState } from 'react'
import { Gauge, Loader2, Play, X } from 'lucide-react'

interface Props {
  tripName: string
  vehiclePlate: string | null
  currentOdometer: number | null
  starting: boolean
  /** Confirma con el odómetro indicado (puede ser null si el chofer optó por omitir). */
  onConfirm: (odometer: number | null) => void
  onClose: () => void
}

export default function StartTripModal({
  tripName, vehiclePlate, currentOdometer, starting, onConfirm, onClose,
}: Props) {
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)

  const parsed = value === '' ? null : parseInt(value, 10)
  const isInvalidNumber = value !== '' && (isNaN(parsed!) || parsed! < 0)
  const isBelowCurrent = parsed != null && currentOdometer != null && parsed < currentOdometer

  function handleConfirm(odometer: number | null) {
    onConfirm(odometer)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">Iniciar reparto</h2>
            <p className="text-xs text-gray-500 truncate">
              {tripName}{vehiclePlate ? ` · ${vehiclePlate}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0" disabled={starting}>
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 mb-1.5">
              <Gauge size={13} className="text-gray-400" />
              Kilometraje actual del vehículo
              <span className="text-gray-400 font-normal">(opcional)</span>
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              autoFocus
              value={value}
              onChange={e => { setValue(e.target.value); setTouched(true) }}
              placeholder={currentOdometer != null ? `Último registrado: ${currentOdometer.toLocaleString('es-AR')} km` : 'Ej. 125000'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          {touched && isInvalidNumber && (
            <p className="text-xs text-red-600">Ingresá un número válido (≥ 0).</p>
          )}
          {touched && !isInvalidNumber && isBelowCurrent && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              El valor es menor al último registrado ({currentOdometer?.toLocaleString('es-AR')} km). El servidor lo va a rechazar.
            </p>
          )}
          <p className="text-[11px] text-gray-500">
            Si no querés cargar km ahora, podés iniciar sin completar.
          </p>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => handleConfirm(null)}
            disabled={starting}
            className="text-sm border border-gray-300 hover:bg-white text-gray-700 font-medium px-4 py-2 rounded-lg disabled:opacity-50"
          >
            Iniciar sin km
          </button>
          <button
            onClick={() => handleConfirm(parsed)}
            disabled={starting || value === '' || isInvalidNumber || isBelowCurrent}
            className="text-sm bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5"
          >
            {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Iniciar reparto
          </button>
        </div>
      </div>
    </div>
  )
}
