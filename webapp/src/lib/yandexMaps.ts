/**
 * Thin wrapper around the Yandex Maps JavaScript API's multiRouter module —
 * real driving routes (distance + duration, with traffic) computed in the
 * browser, since our available Yandex products don't include a standalone
 * server-side routing/distance-matrix API. Route points can be plain
 * address text or [lat, lon] pairs; multiRouter resolves addresses itself.
 *
 * NOT YET VERIFIED against a live API key (none exists at the time this was
 * written) — the general shape (MultiRoute, 'requestsuccess'/'requestfail'
 * events, properties.get('distance'|'duration'|'durationInTraffic').value)
 * matches the documented JS API v2.1 contract, but re-check against a real
 * key before relying on this in production.
 *
 * Renders nothing without VITE_YANDEX_MAPS_API_KEY set — every caller must
 * treat a null return as "fall back to the backend's haversine estimate",
 * never as an error.
 */

declare global {
  interface Window {
    ymaps?: YmapsNamespace
  }
}

interface YmapsRouteProperties {
  get(key: 'distance' | 'duration' | 'durationInTraffic'): { value: number } | undefined
}

interface YmapsMultiRoute {
  model: {
    events: {
      add(event: 'requestsuccess' | 'requestfail', handler: () => void): void
    }
  }
  getActiveRoute(): { properties: YmapsRouteProperties } | null
}

interface YmapsNamespace {
  ready(callback: () => void): void
  multiRouter: {
    MultiRoute: new (
      params: {
        referencePoints: (string | [number, number])[]
        params?: { routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle' }
      },
      options?: { boundsAutoApply?: boolean },
    ) => YmapsMultiRoute
  }
}

let loadPromise: Promise<YmapsNamespace> | null = null

function loadYandexMaps(): Promise<YmapsNamespace> | null {
  const apiKey = import.meta.env.VITE_YANDEX_MAPS_API_KEY
  if (!apiKey) return null

  if (!loadPromise) {
    loadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`
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

export interface RouteEtaResult {
  durationMin: number
  distanceKm: number
}

export async function computeRouteEta(
  from: string | [number, number],
  to: string | [number, number],
): Promise<RouteEtaResult | null> {
  const ymapsPromise = loadYandexMaps()
  if (!ymapsPromise) return null

  const ymaps = await ymapsPromise.catch(() => null)
  if (!ymaps) return null

  return new Promise((resolve) => {
    const multiRoute = new ymaps.multiRouter.MultiRoute(
      { referencePoints: [from, to], params: { routingMode: 'auto' } },
      { boundsAutoApply: false },
    )

    multiRoute.model.events.add('requestsuccess', () => {
      const activeRoute = multiRoute.getActiveRoute()
      const distanceMeters = activeRoute?.properties.get('distance')?.value
      const durationSeconds =
        activeRoute?.properties.get('durationInTraffic')?.value ??
        activeRoute?.properties.get('duration')?.value
      if (distanceMeters == null || durationSeconds == null) {
        resolve(null)
        return
      }
      resolve({
        durationMin: Math.round(durationSeconds / 60),
        distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
      })
    })
    multiRoute.model.events.add('requestfail', () => resolve(null))
  })
}
