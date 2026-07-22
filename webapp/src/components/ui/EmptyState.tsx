import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: ReactNode
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-8 py-14 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--tg-surface)] text-primary"
      >
        {icon}
      </motion.div>
      <p className="text-[15px] font-medium text-[var(--tg-text)]">{title}</p>
      {subtitle && <p className="text-[13px] text-[var(--tg-text-secondary)] max-w-[220px]">{subtitle}</p>}
      {action}
    </div>
  )
}
