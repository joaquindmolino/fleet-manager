/**
 * Captura la ubicación actual del dispositivo. Resuelve con [lat, lng] o null
 * si falla (sin permisos, sin GPS, o timeout). No lanza excepciones: el flujo
 * de inicio/fin de viaje no se debe bloquear si el GPS falla.
 *
 * Internamente reintenta una vez si el navegador devuelve una posición cacheada
 * (timestamp con más de 10s de antigüedad), igual que en DeliveryModePage.
 */
export function captureLocation(): Promise<[number, number] | null> {
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
          resolve([pos.coords.latitude, pos.coords.longitude])
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      )
    }

    request(false)
  })
}
