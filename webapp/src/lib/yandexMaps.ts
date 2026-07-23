/**
 * Thin wrapper around the Yandex Maps JavaScript API — real driving routes
 * (distance + duration, with traffic) computed in the browser, since our
 * available Yandex products don't include a standalone server-side
 * routing/distance-matrix API, plus the shared script loader used by
 * MapAddressPicker.tsx.
 *
 * IMPORTANT — this account's keys have no geocoding access at all (verified
 * directly: https://geocode-maps.yandex.ru/1.x/?apikey=... returns a plain
 * `403 Forbidden: "Invalid api key"` for both the JS-API and Geosuggest
 * keys; Geosuggest's own /v1/suggest response never includes coordinates
 * either — only title/subtitle/tags). That means `ymaps.route()` can only
 * ever work with [lat, lon] pairs, never address strings — passing a
 * string makes Yandex try to geocode it internally, which 403s and (per
 * the API's own behavior, not a bug here) never rejects the outer route()
 * promise, just hangs until our own timeout below fires. computeRouteEta
 * short-circuits to null immediately for a string point instead of paying
 * that 8s tax on a call that cannot ever succeed.
 *
 * Uses `ymaps.route()`, NOT `multiRouter.MultiRoute` — MultiRoute only ever
 * issues its request once added to a live `ymaps.Map` instance (it's a map
 * overlay object), so building one without a map silently never fires
 * 'requestsuccess'/'requestfail' and hangs forever. `ymaps.route()` is
 * Yandex's documented headless variant, meant exactly for "get route info,
 * don't render it" — no map required.
 *
 * The whole thing — script load, `ymaps.ready()`, and the route request
 * itself — races against ROUTE_TIMEOUT_MS as a safety net for any other
 * step that hangs (slow/blocked script load, a `ready()` callback that
 * never fires, a routing request stuck on the network).
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

interface YmapsRouteModel {
  getLength(): number
  getJamsTime?(): number
  getTime(): number
}

interface YmapsMap {
  getCenter(): [number, number]
  events: { add(event: string, handler: () => void): void }
  destroy?(): void
}

interface YmapsNamespace {
  ready(callback: () => void): void
  route(
    points: (string | [number, number])[],
    options?: { mapStateAutoApply?: boolean; routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle' },
  ): {
    then(onResolve: (route: YmapsRouteModel) => void, onReject: (error: unknown) => void): void
  }
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
      // load=package.full guarantees the 'route' helper module is present —
      // the default bundle's module set isn't part of any documented
      // stability contract, so don't rely on it including 'route'.
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

export interface RouteEtaResult {
  durationMin: number
  distanceKm: number
}

const ROUTE_TIMEOUT_MS = 8000

async function computeRouteEtaUnbounded(
  from: string | [number, number],
  to: string | [number, number],
): Promise<RouteEtaResult | null> {
  const ymapsPromise = loadYandexMaps()
  if (!ymapsPromise) return null

  const ymaps = await ymapsPromise.catch((error) => {
    console.warn('[yandexMaps] failed to load JS API', error)
    return null
  })
  if (!ymaps) return null

  return new Promise<RouteEtaResult | null>((resolve) => {
    ymaps.route([from, to], { mapStateAutoApply: false, routingMode: 'auto' }).then(
      (route) => {
        const distanceMeters = route.getLength()
        const durationSeconds = route.getJamsTime?.() ?? route.getTime()
        if (distanceMeters == null || durationSeconds == null) {
          resolve(null)
          return
        }
        resolve({
          durationMin: Math.round(durationSeconds / 60),
          distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
        })
      },
      (error) => {
        console.warn('[yandexMaps] ymaps.route() rejected', error)
        resolve(null)
      },
    )
  })
}

export async function computeRouteEta(
  from: string | [number, number],
  to: string | [number, number],
): Promise<RouteEtaResult | null> {
  if (typeof from === 'string' || typeof to === 'string') {
    // No geocoding access on this account's keys at all (see file-level
    // comment) — a string point would only ever hang for ROUTE_TIMEOUT_MS
    // before failing anyway, so skip the network round-trip entirely.
    console.warn('[yandexMaps] skipping computeRouteEta: address text has no coordinates')
    return null
  }

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      console.warn('[yandexMaps] computeRouteEta timed out after', ROUTE_TIMEOUT_MS, 'ms')
      resolve(null)
    }, ROUTE_TIMEOUT_MS)
  })

  return Promise.race([computeRouteEtaUnbounded(from, to), timeoutPromise])
}
