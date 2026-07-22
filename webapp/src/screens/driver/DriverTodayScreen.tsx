import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Avatar } from '../../components/ui/Avatar'
import { formatTime } from '../../lib/format'
import { driverQueue } from '../../data/mock'
import type { OrderStatus } from '../../data/types'
import { haptics } from '../../lib/haptics'

const nextAction: Partial<Record<OrderStatus, { label: string; next: OrderStatus }>> = {
  pending_driver: { label: 'Принять', next: 'confirmed' },
  confirmed: { label: 'Выехал', next: 'driver_en_route' },
  driver_en_route: { label: 'На месте', next: 'driver_arrived' },
  driver_arrived: { label: 'Начать поездку', next: 'in_progress' },
  in_progress: { label: 'Завершить', next: 'completed' },
}

export function DriverTodayScreen() {
  const [available, setAvailable] = useState(true)
  const [statuses, setStatuses] = useState<Record<string, OrderStatus>>(() =>
    Object.fromEntries(driverQueue.map((o) => [o.id, o.status])),
  )

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--tg-border)] px-4 py-3">
        <div>
          <h1 className="text-[17px] font-semibold text-[var(--tg-text)]">Сегодня</h1>
          <p className="text-[12px] text-[var(--tg-text-secondary)]">
            {driverQueue.length} поездок в расписании
          </p>
        </div>
        <button
          onClick={() => {
            haptics.selection()
            setAvailable((v) => !v)
          }}
          className={`flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
            available ? 'bg-success/10 text-success' : 'bg-[var(--tg-surface)] text-[var(--tg-text-secondary)]'
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${available ? 'bg-success' : 'bg-neutral-400'}`} />
          {available ? 'На линии' : 'Недоступен'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="relative flex flex-col gap-4 pl-5">
          <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--tg-border)]" />
          {driverQueue.map((order, i) => {
            const status = statuses[order.id]
            const action = nextAction[status]
            return (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="relative"
              >
                <span
                  className="absolute -left-5 top-4 h-3 w-3 rounded-full border-2 border-[var(--tg-bg)]"
                  style={{ background: status === 'completed' ? '#10B981' : '#7C3AED' }}
                />
                <Card className="p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-[var(--tg-text)]">{formatTime(order.scheduledAt)}</span>
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-[13px] text-[var(--tg-text)]">{order.from.addressText}</p>
                  <p className="text-[12px] text-[var(--tg-text-secondary)]">→ {order.to.addressText}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--tg-text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Avatar name={order.createdByName} color="#c4b5fd" size={18} />
                      {order.createdByName}
                    </span>
                    <span>≈ {order.etaMin} мин · {order.distanceKm} км · {order.passengers} пасс.</span>
                  </div>

                  {action && (
                    <div className="mt-3 flex gap-2 border-t border-[var(--tg-border)] pt-3">
                      {status === 'pending_driver' && (
                        <Button
                          variant="danger"
                          size="md"
                          full
                          onClick={() => {
                            haptics.impact('medium')
                            setStatuses((s) => ({ ...s, [order.id]: 'cancelled_by_driver' }))
                          }}
                        >
                          Отклонить
                        </Button>
                      )}
                      <Button
                        size="md"
                        full
                        onClick={() => {
                          haptics.notification('success')
                          setStatuses((s) => ({ ...s, [order.id]: action.next }))
                        }}
                      >
                        {action.label}
                      </Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
