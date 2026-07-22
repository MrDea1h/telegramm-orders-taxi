import { motion } from 'framer-motion'
import { TopBar } from '../../components/ui/TopBar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { RouteMap } from '../../components/ui/RouteMap'
import { StatusStepper } from '../../components/ui/StatusStepper'
import { Avatar } from '../../components/ui/Avatar'
import { formatDate, formatTime } from '../../lib/format'
import { drivers, orderHistory, upcomingOrder } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function OrderDetailScreen() {
  const closeOrder = useAppStore((s) => s.closeOrder)
  const selectedOrderId = useAppStore((s) => s.selectedOrderId)

  const order = [upcomingOrder, ...orderHistory].find((o) => o.id === selectedOrderId) ?? upcomingOrder
  const driver = drivers.find((d) => d.id === order.driverId)
  const canModify = order.status === 'pending_driver' || order.status === 'confirmed'
  const canCancel = canModify || order.status === 'driver_en_route'

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <TopBar title="Заказ" onBack={closeOrder} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
          <RouteMap />

          <Card className="p-4">
            <StatusStepper status={order.status} />
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="my-1 h-6 w-px bg-[var(--tg-border)]" />
                <span className="h-2 w-2 rounded-full bg-secondary" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium text-[var(--tg-text)]">{order.from.addressText}</p>
                <p className="mt-3 text-[14px] font-medium text-[var(--tg-text)]">{order.to.addressText}</p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--tg-border)] pt-3 text-[13px] text-[var(--tg-text-secondary)]">
              <span>{formatDate(order.scheduledAt)}, {formatTime(order.scheduledAt)}</span>
              <span>≈ {order.etaMin} мин · {order.distanceKm} км</span>
            </div>
          </Card>

          {driver && (
            <Card className="flex items-center gap-3 p-4">
              <Avatar name={driver.fullName} color={driver.avatarColor} size={44} />
              <div className="flex-1">
                <p className="text-[14px] font-medium text-[var(--tg-text)]">{driver.fullName}</p>
                <p className="text-[12px] text-[var(--tg-text-secondary)]">
                  {driver.car.model} · {driver.car.color} · {driver.car.plate}
                </p>
              </div>
              <a
                href="https://yandex.ru/maps"
                target="_blank"
                rel="noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-surface)] text-primary"
                aria-label="Открыть маршрут"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l-6-4V4l6 4m0 10l6-4m-6 4V8m6 6l6 4V8l-6-4m0 10V4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </Card>
          )}

          {order.comment && (
            <Card className="p-4">
              <p className="text-[12px] font-medium text-[var(--tg-text-secondary)]">Комментарий</p>
              <p className="mt-1 text-[13px] text-[var(--tg-text)]">{order.comment}</p>
            </Card>
          )}
        </motion.div>
      </div>

      {canCancel && (
        <div className="flex gap-2 border-t border-[var(--tg-border)] p-4">
          {canModify && (
            <Button variant="secondary" full onClick={closeOrder}>
              Изменить
            </Button>
          )}
          <Button variant="danger" full onClick={closeOrder}>
            Отменить
          </Button>
        </div>
      )}
    </div>
  )
}
