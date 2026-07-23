/**
 * Direct client-side calls to the Yandex Geocoder HTTP API (CORS-enabled —
 * verified via `curl -v`, the API responds with
 * `Access-Control-Allow-Origin: *`, so no backend proxy is needed).
 *
 * Coordinate order gotcha: Yandex's `pos` field and the `geocode` query
 * param both use "longitude latitude" — the opposite of the usual
 * "latitude, longitude" convention every other part of this codebase uses.
 * Verified directly: geocoding Red Square's real lat/lon in (lat, lon)
 * order resolved to a location in Iran; swapping to (lon, lat) resolved
 * correctly to "Россия, Москва, территория Кремль". This module is the
 * only place that deals with Yandex's order — everything it exports uses
 * the app's normal [lat, lon] convention.
 */

const GEOCODER_ENDPOINT = 'https://geocode-maps.yandex.ru/1.x/'
const REQUEST_TIMEOUT_MS = 5000

function apiKey(): string | null {
  return import.meta.env.VITE_YANDEX_GEOCODER_API_KEY || null
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res.ok ? res : null
  } catch (error) {
    console.warn('[yandexGeocoder] request failed', error)
    return null
  } finally {
    clearTimeout(timeout)
  }
}

interface GeoObjectResult {
  coords: [number, number]
  formattedAddress: string
}

function parseFirstResult(data: unknown): GeoObjectResult | null {
  const member = (
    data as {
      response?: {
        GeoObjectCollection?: {
          featureMember?: {
            GeoObject: {
              Point: { pos: string }
              metaDataProperty?: { GeocoderMetaData?: { text?: string } }
            }
          }[]
        }
      }
    }
  )?.response?.GeoObjectCollection?.featureMember?.[0]
  if (!member) return null

  const [lonStr, latStr] = member.GeoObject.Point.pos.split(' ')
  const lat = Number.parseFloat(latStr)
  const lon = Number.parseFloat(lonStr)
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null

  return {
    coords: [lat, lon],
    formattedAddress: member.GeoObject.metaDataProperty?.GeocoderMetaData?.text ?? '',
  }
}

/** Free-text address -> real coordinates + Yandex's own formatted address. */
export async function geocodeAddress(text: string): Promise<GeoObjectResult | null> {
  const key = apiKey()
  if (!key || !text.trim()) return null

  const url = `${GEOCODER_ENDPOINT}?apikey=${key}&geocode=${encodeURIComponent(text)}&lang=ru_RU&format=json&results=1`
  const res = await fetchWithTimeout(url)
  if (!res) return null

  try {
    return parseFirstResult(await res.json())
  } catch (error) {
    console.warn('[yandexGeocoder] failed to parse geocode response', error)
    return null
  }
}

/** Coordinates -> a real human-readable address (reverse geocoding). */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const key = apiKey()
  if (!key) return null

  const url = `${GEOCODER_ENDPOINT}?apikey=${key}&geocode=${lon},${lat}&lang=ru_RU&format=json&results=1`
  const res = await fetchWithTimeout(url)
  if (!res) return null

  try {
    const parsed = parseFirstResult(await res.json())
    return parsed?.formattedAddress || null
  } catch (error) {
    console.warn('[yandexGeocoder] failed to parse reverse-geocode response', error)
    return null
  }
}
