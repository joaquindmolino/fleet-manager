import { api } from '@/lib/api'

/**
 * Descarga el PDF de hoja de ruta de un viaje y dispara la descarga
 * en el navegador. Usa axios con responseType blob para preservar bytes.
 */
export async function downloadRouteSheet(tripId: string, fallbackFileName: string): Promise<void> {
  const resp = await api.get<Blob>(`/trips/${tripId}/route-sheet.pdf`, {
    responseType: 'blob',
  })
  const blob = resp.data
  const filename = parseFilename(resp.headers?.['content-disposition']) ?? fallbackFileName
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function parseFilename(contentDisposition: string | undefined): string | null {
  if (!contentDisposition) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition)
  return match ? decodeURIComponent(match[1]) : null
}
