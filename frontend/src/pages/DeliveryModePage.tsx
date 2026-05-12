import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MapPin, CheckCircle, AlertTriangle, Flag, ChevronLeft, Loader2, Pencil, X } from 'lucide-react'
import { api } from '@/lib/api'
import { captureLocation } from '@/lib/geolocation'
import type { Trip, TripStop } from '@/types'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function DeliveryModePage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [locating, setLocating] = useState(false)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [stopError, setStopError] = useState<string | null>(null)
  const [savedToast, setSavedToast] = useState<TripStop | null>(null)
  const [editingStop, setEditingStop] = useState<TripStop | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [showFinishModal, setShowFinishModal] = useState(false)
  const [endOdometer, setEndOdometer] = useState('')

  const { data: trip, isLoading: loadingTrip } = useQuery({
    queryKey: ['trips', 'active'],
    queryFn: () =>
      api.get<Trip>('/trips/active').then(r => r.data).catch((e: { response?: { status?: number } }) => {
        if (e?.response?.status === 404) return null
        throw e
      }),
    retry: false,
  })

  const { data: stops = [], isLoading: loadingStops } = useQuery({
    queryKey: ['trip-stops', trip?.id],
    queryFn: () => api.get<TripStop[]>(`/trips/${trip!.id}/stops`).then(r => r.data),
    enabled: !!trip,
    refetchInterval: 15_000,
  })

  const stopMutation = useMutation({
    mutationFn: (body: { lat: number; lng: number; accuracy: number | null; timestamp: string }) =>
      api.post<TripStop>(`/trips/${trip!.id}/stops`, body).then(r => r.data),
    onSuccess: (newStop) => {
      qc.invalidateQueries({ queryKey: ['trip-stops', trip!.id] })
      setGeoError(null)
      setStopError(null)
      setSavedToast(newStop)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const detail = err?.response?.data?.detail
      setStopError(detail ?? 'No se pudo guardar la entrega. Intentá de nuevo.')
    },
  })

  const updateNoteMutation = useMutation({
    mutationFn: ({ stopId, notes }: { stopId: string; notes: string | null }) =>
      api.patch<TripStop>(`/trips/${trip!.id}/stops/${stopId}`, { notes }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip-stops', trip!.id] })
      setEditingStop(null)
      setNoteInput('')
    },
  })

  const finishMutation = useMutation({
    mutationFn: async () => {
      // Capturamos GPS de fin en background; si falla, finalizamos igual sin coords.
      const coords = await captureLocation()
      return api.post(`/trips/${trip!.id}/complete`, {
        end_odometer: endOdometer ? parseInt(endOdometer) : undefined,
        end_lat: coords?.lat,
        end_lng: coords?.lng,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] })
      qc.invalidateQueries({ queryKey: ['trips', 'active'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      navigate('/dashboard')
    },
  })

  async function handleRegisterStop() {
    setGeoError(null)
    setStopError(null)
    setLocating(true)
    const coords = await captureLocation()
    setLocating(false)
    if (!coords) {
      setGeoError('No se pudo obtener la ubicación. Verificá los permisos.')
      return
    }
    stopMutation.mutate({
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      timestamp: new Date().toISOString(),
    })
  }

  // El toast de "entrega guardada" se oculta a los 5s si el chofer no toca nada.
  useEffect(() => {
    if (!savedToast) return
    const t = setTimeout(() => setSavedToast(null), 5000)
    return () => clearTimeout(t)
  }, [savedToast])

  function openNoteEditor(stop: TripStop) {
    setSavedToast(null)
    setEditingStop(stop)
    setNoteInput(stop.notes ?? '')
  }

  function saveNote() {
    if (!editingStop) return
    updateNoteMutation.mutate({
      stopId: editingStop.id,
      notes: noteInput.trim() || null,
    })
  }

  if (loadingTrip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Cargando...
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-gray-500 text-sm">No tenés un reparto activo.</p>
        <button onClick={() => navigate('/dashboard')} className="text-blue-600 text-sm font-medium">
          Volver al dashboard
        </button>
      </div>
    )
  }

  const plannedCount = trip.stops_count ?? null
  const extraCount = stops.filter(s => s.is_extra).length
  const totalCount = stops.length
  const reachedPlanned = plannedCount !== null && totalCount >= plannedCount

  return (
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">

      {/* Header fijo */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center gap-3 shrink-0">
        <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-600 p-1">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-gray-900 truncate">
            {trip.associated_document ?? 'Reparto'}
          </p>
          <p className="text-xs text-gray-400">
            Inicio: {trip.start_time ? formatTime(trip.start_time) : '—'}
            {trip.start_time ? ` · ${formatDate(trip.start_time)}` : ''}
          </p>
        </div>
      </div>

      {/* Zona scrolleable: contador + banner + error + historial */}
      <div className="flex-1 min-h-0 overflow-y-auto">

        {/* Contador */}
        <div className="px-4 pt-5 pb-3">
          <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4">
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Entregas</p>
                <p className="text-3xl font-bold text-gray-900">
                  {totalCount}
                  {plannedCount !== null && (
                    <span className="text-xl font-normal text-gray-400"> / {plannedCount}</span>
                  )}
                </p>
                {extraCount > 0 && (
                  <p className="text-xs text-amber-600 font-medium mt-0.5">{extraCount} extra{extraCount > 1 ? 's' : ''}</p>
                )}
              </div>
              {plannedCount !== null && (
                <div className="text-right">
                  <p className="text-xs text-gray-400 mb-1">{Math.round(Math.min((totalCount / plannedCount) * 100, 100))}%</p>
                </div>
              )}
            </div>

            {plannedCount !== null && (
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${reachedPlanned ? 'bg-green-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min((totalCount / plannedCount) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Banner "completaste todas" */}
        {reachedPlanned && (
          <div className="px-4 pb-3">
            <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-4 flex items-start gap-3">
              <CheckCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-800">
                  ¡Completaste las {plannedCount} entregas planificadas!
                </p>
                <p className="text-xs text-green-600 mt-0.5">
                  Podés finalizar el reparto o agregar entregas extra.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error de geo */}
        {geoError && (
          <div className="px-4 pb-3">
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{geoError}</p>
            </div>
          </div>
        )}

        {/* Historial de stops */}
        <div className="px-4 pb-4">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Historial de entregas</p>
            </div>
            {loadingStops ? (
              <div className="p-6 text-center text-sm text-gray-400">Cargando...</div>
            ) : stops.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-400">Todavía no hay entregas registradas.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {[...stops].reverse().map((stop, i) => (
                  <button
                    type="button"
                    key={stop.id}
                    onClick={() => openNoteEditor(stop)}
                    className="w-full px-5 py-3 flex items-start gap-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${stop.is_extra ? 'bg-amber-100' : 'bg-blue-100'}`}>
                      {stop.is_extra
                        ? <Flag size={12} className="text-amber-600" />
                        : <MapPin size={12} className="text-blue-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-800">
                          Entrega {stops.length - i}
                        </p>
                        {stop.is_extra && (
                          <span className="text-xs bg-amber-100 text-amber-700 font-medium px-1.5 py-0.5 rounded">
                            Extra
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{formatTime(stop.timestamp)}</p>
                      {stop.notes
                        ? <p className="text-xs text-gray-600 mt-1">{stop.notes}</p>
                        : <p className="text-xs text-gray-300 italic mt-1">Sin nota — tocá para agregar</p>
                      }
                    </div>
                    <Pencil size={13} className="text-gray-300 shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Footer fijo: botones de acción */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 pt-3 pb-5 flex flex-col gap-2">
        <button
          onClick={handleRegisterStop}
          disabled={locating || stopMutation.isPending}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-colors shadow-sm ${
            reachedPlanned
              ? 'bg-amber-500 hover:bg-amber-600 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          } disabled:opacity-50`}
        >
          {locating || stopMutation.isPending ? (
            <><Loader2 size={20} className="animate-spin" /> {locating ? 'Obteniendo ubicación...' : 'Guardando...'}</>
          ) : reachedPlanned ? (
            <><Flag size={20} /> Agregar entrega extra</>
          ) : (
            <><MapPin size={20} /> Registrar entrega</>
          )}
        </button>
        <button
          onClick={() => setShowFinishModal(true)}
          className="w-full py-3.5 rounded-2xl border-2 border-gray-300 text-gray-700 font-semibold text-sm hover:border-gray-400 hover:bg-gray-50 transition-colors"
        >
          Finalizar reparto
        </button>
      </div>

      {/* Toast de entrega guardada con opción de agregar nota */}
      {savedToast && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-3 max-w-[90%]">
          <CheckCircle size={18} className="text-green-400 shrink-0" />
          <p className="text-sm font-medium">Entrega guardada</p>
          <button
            onClick={() => openNoteEditor(savedToast)}
            className="text-xs font-semibold bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Agregar nota
          </button>
          <button onClick={() => setSavedToast(null)} className="text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Error al guardar entrega */}
      {stopError && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-center gap-2 max-w-[90%]">
          <AlertTriangle size={16} className="shrink-0" />
          <p className="text-sm font-medium">{stopError}</p>
          <button onClick={() => setStopError(null)} className="ml-2 text-white/70 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Modal de edición de nota (post-guardado o desde la lista) */}
      {editingStop && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setEditingStop(null)}>
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-gray-900">Nota de la entrega</p>
              <button onClick={() => setEditingStop(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X size={18} />
              </button>
            </div>
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveNote()}
              placeholder="Ej: cliente ausente, entrega en portería..."
              autoFocus
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <button
              onClick={saveNote}
              disabled={updateNoteMutation.isPending}
              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2"
            >
              {updateNoteMutation.isPending
                ? <Loader2 size={16} className="animate-spin" />
                : <CheckCircle size={16} />
              }
              Guardar nota
            </button>
          </div>
        </div>
      )}

      {/* Modal finalizar reparto */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8">
            <p className="font-bold text-gray-900 text-lg mb-1">¿Finalizar reparto?</p>
            <p className="text-sm text-gray-500 mb-5">
              {totalCount} entrega{totalCount !== 1 ? 's' : ''} registrada{totalCount !== 1 ? 's' : ''}.
              {extraCount > 0 && ` (${extraCount} extra${extraCount !== 1 ? 's' : ''})`}
            </p>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Km odómetro final (opcional)
              </label>
              <input
                type="number"
                min={trip.start_odometer ?? 0}
                value={endOdometer}
                onChange={e => setEndOdometer(e.target.value)}
                placeholder={trip.start_odometer ? String(trip.start_odometer) : 'Sin registrar'}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinishModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => finishMutation.mutate()}
                disabled={finishMutation.isPending}
                className="flex-1 py-3 bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center justify-center gap-2"
              >
                {finishMutation.isPending
                  ? <Loader2 size={16} className="animate-spin" />
                  : <CheckCircle size={16} />
                }
                Finalizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
