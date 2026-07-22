import clsx from 'clsx'
import { motion } from 'framer-motion'
import { haptics } from '../../lib/haptics'

export function TabStrip<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; badge?: number }[]
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-[var(--tg-border)] px-3 pb-0 pt-1">
      {tabs.map((tab) => {
        const isActive = tab.key === active
        return (
          <button
            key={tab.key}
            onClick={() => {
              haptics.selection()
              onChange(tab.key)
            }}
            className="relative shrink-0 px-3 py-2.5 text-[13px] font-medium"
          >
            <span
              className={clsx(
                'flex items-center gap-1.5 transition-colors',
                isActive ? 'text-primary' : 'text-[var(--tg-text-secondary)]',
              )}
            >
              {tab.label}
              {!!tab.badge && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                  {tab.badge}
                </span>
              )}
            </span>
            {isActive && (
              <motion.div
                layoutId="admin-tab-underline"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-gradient-to-r from-primary to-secondary"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
