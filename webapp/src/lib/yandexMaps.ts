/**
 * Shared loader for the Yandex Maps JavaScript API script — used by
 * MapAddressPicker.tsx to render an interactive map for manually pinning a
 * location.
 *
 * Real driving distance/duration is NOT computed here anymore — it comes
 * from the backend (OpenRouteService, see api/app/routing_api.py). An
 * earlier version of this file called `ymaps.route()` client-side, but that
 * only ever worked with [lat, lon] pairs (this account's Yandex keys have
 * no geocoding access — passing an address string made Yandex try to
 * geocode it internally, which 403s and never rejects the outer promise,
 * just hangs), and real routing access itself turned out to not be part of
 * this account's tier either. Removed rather than left as dead/unreachable
 * code once the backend took over.
 *
 * Renders nothing without VITE_YANDEX_MAPS_API_KEY set.
 */

declare global {
  interface Window {
    ymaps?: YmapsNamespace
  }
}

interface YmapsMap {
  getCenter(): [number, number]
  events: { add(event: string, handler: () => void): void }
  destroy?(): void
}

interface YmapsNamespace {
  ready(callback: () => void): void
  Map: new (
    element: HTMLElement,
    state: { center: [number, number]; zoom: number; controls?: string[] },
  ) => YmapsMap
}

let loadPromise: Promise<YmapsNamespace> | null = null

export function loadYandexMaps(): Promise<YmapsNamespace> | null {
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY
  if (!apiKey) return null

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU&load=package.full`
      script.async = true
      script.onload = () => {
        if (!window.ymaps) {
          reject(new Error('Yandex Maps JS API loaded but window.ymaps is missing'))
          return
        }
        window.ymaps.ready(() => resolve(window.ymaps!))
      }
      script.onerror = () => reject(new Error('Failed to load the Yandex Maps JS API script'))
      document.head.appendChild(script)
    })
  }
  return loadPromise
}
