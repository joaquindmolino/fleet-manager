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

/**
 * Comparte el PDF usando la Web Share API nativa (Android / iOS). Si el
 * navegador no soporta compartir archivos, cae a descargar el PDF para
 * que el usuario lo adjunte manualmente.
 *
 * Devuelve `true` si se mostró el menú de compartir nativo.
 */
export async function shareRouteSheetFile(tripId: string, fallbackFileName: string): Promise<boolean> {
  const resp = await api.get<Blob>(`/trips/${tripId}/route-sheet.pdf`, {
    responseType: 'blob',
  })
  const filename = parseFilename(resp.headers?.['content-disposition']) ?? fallbackFileName
  const file = new File([resp.data], filename, { type: 'application/pdf' })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData & { files?: File[] }) => boolean
    share?: (data: ShareData & { files?: File[] }) => Promise<void>
  }
  if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Hoja de ruta', text: 'Hoja de ruta del viaje' })
      return true
    } catch {
      // usuario canceló o falló: fallback a descarga
    }
  }
  // Fallback: descargar
  const url = URL.createObjectURL(resp.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return false
}

/**
 * Genera (o recupera) el token público del viaje y devuelve la URL absoluta
 * de la hoja de ruta sin autenticación, lista para compartir por WhatsApp.
 */
export async function getPublicRouteSheetUrl(tripId: string): Promise<string> {
  const { data } = await api.post<{ token: string }>(`/trips/${tripId}/share-token`)
  return absolutePublicUrl(`/public/trips/share/${data.token}/route-sheet.pdf`)
}

/**
 * Copia al portapapeles la URL pública de la hoja de ruta. Devuelve la URL.
 */
export async function copyPublicRouteSheetUrl(tripId: string): Promise<string> {
  const url = await getPublicRouteSheetUrl(tripId)
  await navigator.clipboard.writeText(url)
  return url
}

function parseFilename(contentDisposition: string | undefined): string | null {
  if (!contentDisposition) return null
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition)
  return match ? decodeURIComponent(match[1]) : null
}

function absolutePublicUrl(path: string): string {
  // baseURL puede ser '/api/v1' (mismo origen) o 'https://backend.../api/v1' (full).
  const base = (api.defaults.baseURL ?? '/api/v1').replace(/\/+$/, '')
  if (base.startsWith('http')) return `${base}${path}`
  // Relativo: combinamos con el origen actual.
  return `${window.location.origin}${base}${path}`
}
