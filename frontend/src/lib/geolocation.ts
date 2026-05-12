export interface CapturedLocation {
  lat: number
  lng: number
  accuracy: number | null
}

/**
 * Captura la ubicación actual del dispositivo. Resuelve con la posición o null
 * si falla (sin permisos, sin GPS, o timeout). No lanza excepciones: el flujo
 * de captura no se debe bloquear si el GPS falla.
 *
 * Internamente reintenta una vez si el navegador devuelve una posición cacheada
 * (timestamp con más de 10s de antigüedad).
 */
export function captureLocation(): Promise<CapturedLocation | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }

    function request(isRetry: boolean) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          const ageMs = Date.now() - pos.timestamp
          if (ageMs > 10_000 && !isRetry) {
            request(true)
            return
          }
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? null,
          })
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    }

    request(false)
  })
}
