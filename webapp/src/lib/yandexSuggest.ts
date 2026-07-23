/**
 * Direct client-side calls to the Yandex Geosuggest API — surfaces
 * businesses/landmarks as you type (verified live: searching "Макдоналдс
 * Москва" returns real fast-food locations, tagged "business"), which the
 * plain Geocoder cannot do at all (verified: geocoding the same text just
 * matches the city and drops the business name entirely, precision "other").
 *
 * Geosuggest itself never returns coordinates (see yandexGeocoder.ts's own
 * comment) — only title/subtitle/tags/distance. The subtitle for a business
 * result looks like "Категория · Город, Улица, Дом"; the part after the
 * last "·" is a real, precise street address that the Geocoder resolves
 * correctly (verified: geocoding "Москва, Тверская улица, 4/3" extracted
 * this way lands exactly on Tverskaya 4). That's the whole trick here —
 * suggest for search-as-you-type, then geocode the address portion, never
 * the business name itself.
 */

const SUGGEST_ENDPOINT = 'https://suggest-maps.yandex.ru/v1/suggest'
const REQUEST_TIMEOUT_MS = 5000

function apiKey(): string | null {
  return import.meta.env.VITE_YANDEX_GEOSUGGEST_API_KEY || null
}

export interface Suggestion {
  /** What to show the user (business/place name, or the address itself). */
  title: string
  subtitle: string
  /** What to actually geocode — the address portion, never the raw title. */
  addressText: string
}

export async function fetchSuggestions(text: string): Promise<Suggestion[]> {
  const key = apiKey()
  if (!key || !text.trim()) return []

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(
      `${SUGGEST_ENDPOINT}?apikey=${key}&text=${encodeURIComponent(text)}&lang=ru_RU&results=5`,
      { signal: controller.signal },
    )
  } catch (error) {
    console.warn('[yandexSuggest] request failed', error)
    return []
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) return []

  try {
    const data = (await res.json()) as {
      results?: { title?: { text?: string }; subtitle?: { text?: string } }[]
    }
    return (data.results ?? []).map((r) => {
      const title = r.title?.text ?? ''
      const subtitle = r.subtitle?.text ?? ''
      const parts = subtitle.split('·')
      const addressText = parts[parts.length - 1].trim() || title
      return { title, subtitle, addressText }
    })
  } catch (error) {
    console.warn('[yandexSuggest] failed to parse suggest response', error)
    return []
  }
}
