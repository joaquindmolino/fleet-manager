import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { api } from '@/lib/api'

interface Suggestion {
  label: string
  lat: number
  lng: number
}

interface Props {
  value: string
  onChange: (text: string) => void
  onSelect: (s: Suggestion) => void
  placeholder?: string
  className?: string
  country?: string
}

/**
 * Input con autocompletado de direcciones. Pega al backend que proxea a
 * OpenRouteService Pelias. Debouncea a 350ms para no quemar la cuota.
 */
export default function AddressAutocomplete({
  value, onChange, onSelect, placeholder = 'Ej: Pinzón 65, Junín', className = '', country = 'AR',
}: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const lastQueryRef = useRef('')

  useEffect(() => {
    const text = value.trim()
    if (text.length < 3) {
      setSuggestions([])
      setLoading(false)
      return
    }
    if (text === lastQueryRef.current) return
    setLoading(true)
    const handle = setTimeout(() => {
      lastQueryRef.current = text
      api.get<Suggestion[]>('/routing/autocomplete', { params: { q: text, country } })
        .then(r => {
          setSuggestions(r.data)
          setOpen(true)
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, 350)
    return () => clearTimeout(handle)
  }, [value, country])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function pick(s: Suggestion) {
    onSelect(s)
    onChange(s.label)
    setOpen(false)
    setSuggestions([])
    lastQueryRef.current = s.label
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {loading && (
        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pick(s)}
              className="w-full px-3 py-2 flex items-start gap-2 hover:bg-blue-50 text-left text-sm transition-colors"
            >
              <MapPin size={14} className="text-blue-500 shrink-0 mt-0.5" />
              <span className="text-gray-700">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
