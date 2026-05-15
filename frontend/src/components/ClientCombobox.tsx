import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { Client } from '@/types'

interface Props {
  clients: Client[]
  /** Cliente seleccionado actualmente, o null si no hay. */
  selectedClientId: string | null
  /** Llamado cuando el usuario elige (o crea) un cliente. */
  onSelect: (client: Client) => void
  /** Llamado cuando el usuario tira el cliente actual. */
  onClear: () => void
  /** Crea un cliente nuevo con sólo el nombre; debe devolver el cliente creado. */
  onCreate: (name: string) => Promise<Client>
  placeholder?: string
}

/**
 * Combobox de cliente: busca incrementalmente entre los existentes.
 * Si no hay match exacto, ofrece la opción "Crear 'X'" que llama a `onCreate`.
 */
export default function ClientCombobox({
  clients, selectedClientId, onSelect, onClear, onCreate,
  placeholder = 'Buscar o crear cliente',
}: Props) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const selected = selectedClientId ? clients.find(c => c.id === selectedClientId) : null

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const query = text.trim().toLowerCase()
  const filtered = query
    ? clients.filter(c => c.name.toLowerCase().includes(query)).slice(0, 8)
    : clients.slice(0, 8)
  const exactMatch = clients.find(c => c.name.trim().toLowerCase() === query)
  const showCreateOption = query.length >= 2 && !exactMatch

  async function handleCreate() {
    if (creating || !query) return
    setCreating(true)
    try {
      const created = await onCreate(text.trim())
      onSelect(created)
      setText('')
      setOpen(false)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      alert(err?.response?.data?.detail ?? 'No se pudo crear el cliente.')
    } finally {
      setCreating(false)
    }
  }

  function handlePick(c: Client) {
    onSelect(c)
    setText('')
    setOpen(false)
  }

  // Si hay cliente seleccionado, lo mostramos como "chip" y un X para tirarlo.
  if (selected && !open) {
    return (
      <div className="flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-xs bg-white">
        <button
          onClick={() => { setOpen(true); setText('') }}
          className="flex-1 min-w-0 text-left truncate text-gray-800 hover:text-blue-600"
          title="Cambiar cliente"
        >
          {selected.name}
        </button>
        <button
          onClick={onClear}
          title="Quitar cliente"
          className="text-gray-400 hover:text-red-500 shrink-0"
        >
          <X size={12} />
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={text}
        onChange={e => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={selected ? selected.name : placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {open && (filtered.length > 0 || showCreateOption) && (
        <div className="absolute left-0 right-0 mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-md py-1 max-h-56 overflow-y-auto">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              onClick={() => handlePick(c)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-700"
            >
              {c.name}
              {c.contact_name && <span className="text-gray-400 ml-1.5">· {c.contact_name}</span>}
            </button>
          ))}
          {showCreateOption && (
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-green-50 text-green-700 font-medium border-t border-gray-100 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus size={11} />
              {creating ? 'Creando...' : <>Crear cliente <span className="font-semibold">"{text.trim()}"</span></>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
