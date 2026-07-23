/**
 * A link to open real navigation to a point in Yandex Maps — `rtext=~lat,lon`
 * with an empty "from" (`~`) lets Yandex Maps use the driver's current
 * location as the route start automatically. Works as a plain web link
 * (opens the Yandex Maps app on a phone that has it installed, or the web
 * app otherwise) — no API key needed, this is just a public deep-link URL
 * format, not an API call.
 */
export function yandexNavigationUrl(lat: number, lon: number): string {
  return `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`
}
