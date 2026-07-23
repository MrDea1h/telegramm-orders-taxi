export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now()
  const diffMin = Math.round(diffMs / 60000)
  if (Math.abs(diffMin) < 60) return diffMin >= 0 ? `через ${diffMin} мин` : `${Math.abs(diffMin)} мин назад`
  const diffH = Math.round(diffMin / 60)
  if (Math.abs(diffH) < 24) return diffH >= 0 ? `через ${diffH} ч` : `${Math.abs(diffH)} ч назад`
  return formatDate(iso)
}

// Yandex's geocoded addresses come back fully qualified — "Россия, Москва,
// Армянский переулок, 3-5с10" — which wraps awkwardly in a compact card.
// Keep only the last two comma-separated segments (street + house in every
// case seen from this account's Geocoder), which is what actually matters
// once you're already in the right city. Full text stays untouched in
// OrderDetailScreen and anywhere copied for a navigation app.
export function shortenAddress(fullAddress: string): string {
  const parts = fullAddress
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length <= 2) return fullAddress
  return parts.slice(-2).join(', ')
}
