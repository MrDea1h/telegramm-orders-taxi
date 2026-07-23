import type { Role } from '../data/types'
import { haptics } from '../lib/haptics'
import { useAppStore } from '../store/appStore'

interface AdminViewSwitcherProps {
  variant?: 'light' | 'default'
}

const VIEWS: { key: Role; label: string }[] = [
  { key: 'admin', label: 'Админ' },
  { key: 'user', label: 'Сотрудник' },
  { key: 'driver', label: 'Водитель' },
]

/**
 * Admin accounts are treated as superusers with access to every workflow —
 * this lets them flip between the admin panel and the employee/driver
 * screens without logging out. Renders nothing for non-admin accounts.
 */
export function AdminViewSwitcher({ variant = 'default' }: AdminViewSwitcherProps) {
  const role = useAppStore((s) => s.role)
  const adminViewAs = useAppStore((s) => s.adminViewAs)
  const setAdminViewAs = useAppStore((s) => s.setAdminViewAs)

  if (role !== 'admin') return null

  const track = variant === 'light' ? 'bg-white/15' : 'bg-black/5 dark:bg-white/10'
  const activePill =
    variant === 'light'
      ? 'bg-white text-primary shadow-sm'
      : 'bg-white text-primary shadow-sm dark:bg-neutral-700 dark:text-white'
  const inactiveText = variant === 'light' ? 'text-white/80' : 'text-[var(--tg-text-secondary)]'

  return (
    <div className={`flex gap-1 rounded-full p-1 ${track}`}>
      {VIEWS.map((v) => (
        <button
          key={v.key}
          onClick={() => {
            haptics.selection()
            setAdminViewAs(v.key)
          }}
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            adminViewAs === v.key ? activePill : inactiveText
          }`}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
