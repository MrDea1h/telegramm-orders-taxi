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
