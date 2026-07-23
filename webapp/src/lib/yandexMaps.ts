/**
 * Thin wrapper around the Yandex Maps JavaScript API's headless routing
 * helper — real driving routes (distance + duration, with traffic) computed
 * in the browser, since our available Yandex products don't include a
 * standalone server-side routing/distance-matrix API. Route points can be
 * plain address text or [lat, lon] pairs; Yandex resolves addresses itself.
 *
 * Uses `ymaps.route()`, NOT `multiRouter.MultiRoute` — MultiRoute only ever
 * issues its request once added to a live `ymaps.Map` instance (it's a map
 * overlay object), so building one without a map silently never fires
 * 'requestsuccess'/'requestfail' and hangs forever. `ymaps.route()` is
 * Yandex's documented headless variant, meant exactly for "get route info,
 * don't render it" — no map required.
 *
 * The whole thing — script load, `ymaps.ready()`, and the route request
 * itself — races against ROUTE_TIMEOUT_MS. Any of those three steps can
 * hang indefinitely in the wild (slow/blocked script load, a `ready()`
 * callback that never fires for a module-loading reason we can't see from
 * here, a routing request stuck on the network) — a timeout that only
 * wrapped the last step left the first two able to hang the whole ETA
 * step on "..." forever, which is exactly what shipped once already.
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

interface YmapsNamespace {
  ready(callback: () => void): void
  route(
    points: (string | [number, number])[],
    options?: { mapStateAutoApply?: boolean; routingMode?: 'auto' | 'masstransit' | 'pedestrian' | 'bicycle' },
  ): {
    then(onResolve: (route: YmapsRouteModel) => void, onReject: (error: unknown) => void): void
  }
}

let loadPromise: Promise<YmapsNamespace> | null = null

function loadYandexMaps(): Promise<YmapsNamespace> | null {
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
  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => {
      console.warn('[yandexMaps] computeRouteEta timed out after', ROUTE_TIMEOUT_MS, 'ms')
      resolve(null)
    }, ROUTE_TIMEOUT_MS)
  })

  return Promise.race([computeRouteEtaUnbounded(from, to), timeoutPromise])
}
