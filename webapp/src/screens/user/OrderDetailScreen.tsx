import { useState } from 'react'
import { motion } from 'framer-motion'
import { TopBar } from '../../components/ui/TopBar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { RouteMap } from '../../components/ui/RouteMap'
import { StatusStepper } from '../../components/ui/StatusStepper'
import { Avatar } from '../../components/ui/Avatar'
import { PullToRefresh } from '../../components/PullToRefresh'
import { formatDate, formatTime } from '../../lib/format'
import { useCancelOrder, useOrderDetail, useRespondToCounter, useUpdateOrder } from '../../hooks/useOrders'
import { useAppStore } from '../../store/appStore'
import { haptics } from '../../lib/haptics'

export function OrderDetailScreen() {
  const closeOrder = useAppStore((s) => s.closeOrder)
  const selectedOrderId = useAppStore((s) => s.selectedOrderId)
  const { data: order, refetch: refetchOrder } = useOrderDetail(selectedOrderId)
  const updateOrder = useUpdateOrder()
  const cancelOrder = useCancelOrder()
  const respondToCounter = useRespondToCounter()

  const [mode, setMode] = useState<'view' | 'edit' | 'cancel'>('view')
  const [comment, setComment] = useState('')
  const [passengers, setPassengers] = useState(1)
  const [cancelReason, setCancelReason] = useState('')

  if (!order) {
    return (
      <div className="flex h-full flex-col bg-[var(--tg-bg)]">
        <TopBar title="Заказ" onBack={closeOrder} />
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  const canModify = order.status === 'draft' || order.status === 'pending_driver' || order.status === 'confirmed'
  const isCountered = order.status === 'driver_countered'
  const canCancel = canModify || order.status === 'driver_en_route' || isCountered

  function startEdit() {
    setComment(order!.comment ?? '')
    setPassengers(order!.passengers)
    setMode('edit')
  }

  async function saveEdit() {
    await updateOrder.mutateAsync({ id: order!.id, input: { comment, passengers } })
    haptics.notification('success')
    setMode('view')
  }

  async function confirmCancel() {
    await cancelOrder.mutateAsync({ id: order!.id, reason: cancelReason || undefined })
    haptics.notification('success')
    closeOrder()
  }

  async function respondToDriverCounter(accept: boolean) {
    await respondToCounter.mutateAsync({ id: order!.id, accept })
    haptics.notification('success')
    if (!accept) closeOrder()
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <TopBar title="Заказ" onBack={closeOrder} />

      <PullToRefresh className="flex-1 px-4 py-4" onRefresh={() => refetchOrder()}>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <RouteMap />

          <Card className="p-4">
            <StatusStepper status={order.status} />
          </Card>

          {isCountered && order.proposed_scheduled_at && (
            <Card className="flex flex-col gap-3 border border-warning/40 bg-warning/5 p-4">
              <p className="text-[13px] font-medium text-[var(--tg-text)]">
                Водитель не может в исходное время и предлагает другое:
              </p>
              <p className="text-[16px] font-semibold text-primary">
                {formatDate(order.proposed_scheduled_at)}, {formatTime(order.proposed_scheduled_at)}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  full
                  onClick={() => respondToDriverCounter(false)}
                  disabled={respondToCounter.isPending}
                >
                  Отклонить
                </Button>
                <Button full onClick={() => respondToDriverCounter(true)} disabled={respondToCounter.isPending}>
                  Принять
                </Button>
              </div>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="my-1 h-6 w-px bg-[var(--tg-border)]" />
                <span className="h-2 w-2 rounded-full bg-secondary" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium text-[var(--tg-text)]">{order.from_address}</p>
                <p className="mt-3 text-[14px] font-medium text-[var(--tg-text)]">{order.to_address}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--tg-border)] pt-3 text-[13px] text-[var(--tg-text-secondary)]">
              <span>
                {formatDate(order.scheduled_at)}, {formatTime(order.scheduled_at)}
              </span>
              {order.est_distance_km != null && (
                <span>
                  ≈ {order.est_duration_min} мин · {order.est_distance_km} км
                </span>
              )}
            </div>
            {order.is_round_trip && (
              <div className="flex items-center gap-2 border-t border-[var(--tg-border)] pt-3">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Туда-обратно
                </span>
                {order.wait_time_min != null && (
                  <span className="text-[12px] text-[var(--tg-text-secondary)]">
                    Ожидание на месте: {order.wait_time_min} мин
                  </span>
                )}
              </div>
            )}
          </Card>

          {order.driver_full_name && (
            <Card className="flex items-center gap-3 p-4">
              <Avatar name={order.driver_full_name} color="#3B82F6" size={44} />
              <div className="flex-1">
                <p className="text-[14px] font-medium text-[var(--tg-text)]">{order.driver_full_name}</p>
                {order.driver_car_model && (
                  <p className="text-[12px] text-[var(--tg-text-secondary)]">
                    {order.driver_car_model} · {order.driver_car_color} · {order.driver_car_plate}
                  </p>
                )}
              </div>
              <a
                href="https://yandex.ru/maps"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-surface)] text-primary"
                aria-label="Открыть маршрут"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 18l-6-4V4l6 4m0 10l6-4m-6 4V8m6 6l6 4V8l-6-4m0 10V4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </Card>
          )}

          {mode === 'edit' ? (
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-[12px] font-medium text-[var(--tg-text-secondary)]">Пассажиры</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  className="!h-9 !w-9 !px-0"
                  onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                >
                  −
                </Button>
                <span className="text-[15px] font-medium text-[var(--tg-text)]">{passengers}</span>
                <Button
                  variant="secondary"
                  className="!h-9 !w-9 !px-0"
                  onClick={() => setPassengers((p) => Math.min(4, p + 1))}
                >
                  +
                </Button>
              </div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий водителю"
                rows={2}
                className="w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 py-2 text-[14px] text-[var(--tg-text)] outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <Button variant="secondary" full onClick={() => setMode('view')}>
                  Отмена
                </Button>
                <Button full onClick={saveEdit} disabled={updateOrder.isPending}>
                  Сохранить
                </Button>
              </div>
            </Card>
          ) : (
            order.comment && (
              <Card className="p-4">
                <p className="text-[12px] font-medium text-[var(--tg-text-secondary)]">Комментарий</p>
                <p className="mt-1 text-[13px] text-[var(--tg-text)]">{order.comment}</p>
              </Card>
            )
          )}

          {mode === 'cancel' && (
            <Card className="flex flex-col gap-3 p-4">
              <p className="text-[12px] font-medium text-[var(--tg-text-secondary)]">Причина отмены (необязательно)</p>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Причина"
                className="h-11 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 text-[14px] text-[var(--tg-text)] outline-none focus:border-primary"
              />
              <div className="flex gap-2">
                <Button variant="secondary" full onClick={() => setMode('view')}>
                  Назад
                </Button>
                <Button variant="danger" full onClick={confirmCancel} disabled={cancelOrder.isPending}>
                  Подтвердить отмену
                </Button>
              </div>
            </Card>
          )}
        </motion.div>
      </PullToRefresh>

      {canCancel && mode === 'view' && !isCountered && (
        <div className="flex gap-2 border-t border-[var(--tg-border)] p-4">
          {canModify && (
            <Button variant="secondary" full onClick={startEdit}>
              Изменить
            </Button>
          )}
          <Button variant="danger" full onClick={() => setMode('cancel')}>
            Отменить
          </Button>
        </div>
      )}
    </div>
  )
}
