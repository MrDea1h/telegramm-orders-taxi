import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { haptics } from '../../lib/haptics'

export function TopBar({
  title,
  onBack,
  right,
}: {
  title: string
  onBack?: () => void
  right?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-[var(--tg-border)] bg-[var(--tg-bg)]/85 px-3 backdrop-blur-md">
      {onBack ? (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            haptics.selection()
            onBack()
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--tg-text)] active:bg-black/5 dark:active:bg-white/10"
          aria-label="Назад"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.button>
      ) : (
        <div className="w-9" />
      )}
      <h1 className="flex-1 truncate text-[16px] font-semibold text-[var(--tg-text)]">{title}</h1>
      <div className="flex min-w-9 justify-end">{right}</div>
    </div>
  )
}
