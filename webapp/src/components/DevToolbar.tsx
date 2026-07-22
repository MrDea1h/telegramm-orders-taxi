import { useAppStore } from '../store/appStore'
import { useTheme } from '../lib/theme'
import type { Role } from '../data/types'
import clsx from 'clsx'

const roles: { key: Role; label: string }[] = [
  { key: 'user', label: '👤 Сотрудник' },
  { key: 'driver', label: '🚗 Водитель' },
  { key: 'admin', label: '🛠 Админ' },
]

export function DevToolbar() {
  const { role, setRole, showOnboarding, setShowOnboarding } = useAppStore()
  const { mode, toggle } = useTheme()

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-center gap-2 border-b border-black/5 bg-white/90 px-3 py-2 text-[13px] backdrop-blur-md dark:border-white/5 dark:bg-neutral-900/90">
      <span className="mr-1 hidden text-[11px] font-medium uppercase tracking-wide text-neutral-400 sm:inline">
        Демо-панель
      </span>
      <div className="flex gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-800">
        {roles.map((r) => (
          <button
            key={r.key}
            onClick={() => setRole(r.key)}
            className={clsx(
              'rounded-full px-3 py-1.5 font-medium transition-colors',
              role === r.key
                ? 'bg-white text-primary shadow-sm dark:bg-neutral-700 dark:text-white'
                : 'text-neutral-500 dark:text-neutral-400',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>
      <button
        onClick={toggle}
        className="rounded-full bg-neutral-100 px-3 py-1.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
      >
        {mode === 'light' ? '🌙 Тёмная' : '☀️ Светлая'}
      </button>
      <button
        onClick={() => setShowOnboarding(!showOnboarding)}
        className={clsx(
          'rounded-full px-3 py-1.5 font-medium transition-colors',
          showOnboarding
            ? 'bg-primary text-white'
            : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
        )}
      >
        Онбординг
      </button>
    </div>
  )
}
