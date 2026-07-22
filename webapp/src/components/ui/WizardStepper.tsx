import clsx from 'clsx'
import { motion } from 'framer-motion'

export function WizardStepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pb-3 pt-1">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className={clsx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-[var(--tg-surface)]')}
          initial={false}
          animate={{ opacity: i <= step ? 1 : 0.6 }}
        />
      ))}
    </div>
  )
}
