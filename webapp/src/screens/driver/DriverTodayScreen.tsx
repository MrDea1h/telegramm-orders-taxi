import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { LogoutButton } from '../../components/LogoutButton'
import { AdminViewSwitcher } from '../../components/AdminViewSwitcher'
import { formatTime } from '../../lib/format'
import type { OrderStatus } from '../../data/types'
import type { OrderTransitionAction } from '../../lib/api'
import { useDriverQueue, useTransitionOrder } from '../../hooks/useOrders'
import { useMyDriverProfile, useSetDuty } from '../../hooks/useDrivers'
import { haptics } from '../../lib/haptics'

const nextAction: Partial<Record<OrderStatus, { label: string; action: OrderTransitionAction }>> = {
  pending_driver: { label: 'Принять', action: 'accept' },
  confirmed: { label: 'Выехал', action: 'depart' },
  driver_en_route: { label: 'На месте', action: 'arrive' },
  driver_arrived: { label: 'Начать поездку', action: 'start' },
  in_progress: { label: 'Завершить', action: 'complete' },
}

function QueueEmptyIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function DriverTodayScreen() {
  const { data: queue } = useDriverQueue()
  const { data: profile } = useMyDriverProfile()
  const setDuty = useSetDuty()
  const transition = useTransitionOrder()
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const available = profile?.on_duty ?? true

  async function handleTransition(orderId: string, action: OrderTransitionAction, reason?: string) {
    haptics.impact('medium')
    try {
      await transition.mutateAsync({ id: orderId, action, reason })
      haptics.notification('success')
      setRejectingId(null)
      setRejectReason('')
    } catch {
      haptics.notification('error')
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <div className="flex items-center justify-between border-b border-[var(--tg-border)] px-4 py-3">
        <div>
          <h1 className="text-[17px] font-semibold text-[var(--tg-text)]">Сегодня</h1>
          <p className="text-[12px] text-[var(--tg-text-secondary)]">{queue?.length ?? 0} поездок в расписании</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              haptics.selection()
              setDuty.mutate(!available)
            }}
            className={`flex items-center gap-2 rounded-full px-3 py-2 text-[12px] font-medium transition-colors ${
              available ? 'bg-success/10 text-success' : 'bg-[var(--tg-surface)] text-[var(--tg-text-secondary)]'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${available ? 'bg-success' : 'bg-neutral-400'}`} />
            {available ? 'На линии' : 'Недоступен'}
          </button>
          <AdminViewSwitcher />
          <LogoutButton />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {queue && queue.length === 0 ? (
          <EmptyState icon={<QueueEmptyIcon />} title="Нет заказов" subtitle="Новые заказы появятся здесь" />
        ) : (
          <div className="relative flex flex-col gap-4 pl-5">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-[var(--tg-border)]" />
            {queue?.map((order, i) => {
              const action = nextAction[order.status]
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
                    style={{ background: order.status === 'completed' ? '#10B981' : '#7C3AED' }}
                  />
                  <Card className="p-3.5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-[var(--tg-text)]">
                        {formatTime(order.scheduled_at)}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <p className="text-[13px] text-[var(--tg-text)]">{order.from_address}</p>
                    <p className="text-[12px] text-[var(--tg-text-secondary)]">→ {order.to_address}</p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--tg-text-secondary)]">
                      <span>{order.passengers} пасс.</span>
                      {order.est_distance_km != null && (
                        <span>
                          ≈ {order.est_duration_min} мин · {order.est_distance_km} км
                        </span>
                      )}
                    </div>

                    {rejectingId === order.id ? (
                      <div className="mt-3 flex flex-col gap-2 border-t border-[var(--tg-border)] pt-3">
                        <input
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Причина отказа"
                          className="h-10 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 text-[13px] text-[var(--tg-text)] outline-none focus:border-primary"
                        />
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="md"
                            full
                            onClick={() => {
                              setRejectingId(null)
                              setRejectReason('')
                            }}
                          >
                            Назад
                          </Button>
                          <Button
                            variant="danger"
                            size="md"
                            full
                            disabled={!rejectReason.trim()}
                            onClick={() => handleTransition(order.id, 'reject', rejectReason.trim())}
                          >
                            Подтвердить отказ
                          </Button>
                        </div>
                      </div>
                    ) : (
                      action && (
                        <div className="mt-3 flex gap-2 border-t border-[var(--tg-border)] pt-3">
                          {order.status === 'pending_driver' && (
                            <Button variant="danger" size="md" full onClick={() => setRejectingId(order.id)}>
                              Отклонить
                            </Button>
                          )}
                          <Button size="md" full onClick={() => handleTransition(order.id, action.action)}>
                            {action.label}
                          </Button>
                        </div>
                      )
                    )}
                  </Card>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
