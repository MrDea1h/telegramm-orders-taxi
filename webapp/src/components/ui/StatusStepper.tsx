import { motion } from 'framer-motion'
import clsx from 'clsx'
import { orderSteps } from '../../data/statusMeta'
import type { OrderStatus } from '../../data/types'

const cancelledStatuses: OrderStatus[] = [
  'cancelled_by_user',
  'cancelled_by_driver',
  'cancelled_by_admin',
  'expired',
]

export function StatusStepper({ status }: { status: OrderStatus }) {
  if (cancelledStatuses.includes(status)) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-danger/10 px-4 py-3 text-danger">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[13px] font-medium">Заказ отменён</span>
      </div>
    )
  }

  const activeIndex = orderSteps.findIndex((s) => s.key === status)

  return (
    <div className="flex items-start">
      {orderSteps.map((step, i) => {
        const done = i < activeIndex
        const current = i === activeIndex
        const isLast = i === orderSteps.length - 1
        return (
          <div key={step.key} className={clsx('flex items-center', !isLast && 'flex-1')}>
            <div className="flex flex-col items-center gap-1.5">
              <motion.div
                initial={false}
                animate={{ scale: current ? 1.1 : 1 }}
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                  done && 'border-primary bg-primary text-white',
                  current && 'border-primary bg-white text-primary dark:bg-[var(--tg-bg)]',
                  !done && !current && 'border-[var(--tg-border)] text-[var(--tg-text-secondary)]',
                )}
              >
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </motion.div>
              <span
                className={clsx(
                  'w-16 text-center text-[10px] leading-tight',
                  current ? 'font-medium text-[var(--tg-text)]' : 'text-[var(--tg-text-secondary)]',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div className="relative -mt-4 h-0.5 flex-1 bg-[var(--tg-border)]">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary"
                  initial={false}
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
