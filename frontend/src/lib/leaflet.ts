/**
 * Tipos mínimos para Leaflet cargado desde CDN.
 * Usamos `window.L` directamente sin instalar el paquete @types/leaflet.
 *
 * Si más adelante migramos a instalar leaflet via npm, podemos eliminar
 * este archivo y usar los tipos oficiales.
 */

export interface LeafletMap {
  setView: (center: [number, number], zoom: number) => LeafletMap
  fitBounds: (bounds: unknown, options?: { padding?: [number, number] }) => LeafletMap
  remove: () => void
  invalidateSize: () => void
}

export interface LeafletLayer {
  addTo: (m: LeafletMap) => LeafletLayer
  remove: () => void
}

export interface LeafletStatic {
  map: (el: HTMLElement, opts?: object) => LeafletMap
  tileLayer: (url: string, opts?: object) => LeafletLayer
  marker: (latlng: [number, number], opts?: object) => LeafletLayer
  polyline: (points: [number, number][], opts?: object) => LeafletLayer
  divIcon: (opts: object) => unknown
  latLngBounds: (points: [number, number][]) => unknown
}

declare global {
  interface Window { L?: LeafletStatic }
}
