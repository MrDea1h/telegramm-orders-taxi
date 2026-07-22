import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { RouteMap } from '../../components/ui/RouteMap'
import { Avatar } from '../../components/ui/Avatar'
import { formatRelative, formatDateShort, formatTime } from '../../lib/format'
import { currentUser, drivers, orderHistory, upcomingOrder } from '../../data/mock'
import { useAppStore } from '../../store/appStore'

export function HomeScreen() {
  const goTo = useAppStore((s) => s.goTo)
  const openOrder = useAppStore((s) => s.openOrder)
  const driver = drivers.find((d) => d.id === upcomingOrder.driverId)

  return (
    <div className="flex h-full flex-col overflow-y-auto pb-28">
      <div className="bg-gradient-to-br from-primary to-secondary px-5 pb-8 pt-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[13px] text-white/80">Добрый день,</p>
            <h1 className="text-[20px] font-semibold">{currentUser.fullName.split(' ')[0]}</h1>
          </div>
          <Avatar name={currentUser.fullName} color="rgba(255,255,255,0.25)" size={40} />
        </div>
      </div>

      <div className="-mt-5 flex flex-col gap-4 px-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <Card className="overflow-hidden p-0" onClick={() => openOrder(upcomingOrder.id)}>
            <div className="cursor-pointer p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-medium text-[var(--tg-text-secondary)]">Ближайшая поездка</p>
                <StatusBadge status={upcomingOrder.status} />
              </div>
              <RouteMap compact />
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-[14px] font-medium text-[var(--tg-text)]">{upcomingOrder.from.addressText}</p>
                  <p className="text-[12px] text-[var(--tg-text-secondary)]">→ {upcomingOrder.to.addressText}</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-semibold text-primary">{formatRelative(upcomingOrder.scheduledAt)}</p>
                  <p className="text-[11px] text-[var(--tg-text-secondary)]">
                    ≈ {upcomingOrder.etaMin} мин · {upcomingOrder.distanceKm} км
                  </p>
                </div>
              </div>
              {driver && (
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--tg-border)] pt-3">
                  <Avatar name={driver.fullName} color={driver.avatarColor} size={28} />
                  <p className="text-[12px] text-[var(--tg-text-secondary)]">
                    {driver.fullName} · {driver.car.model}, {driver.car.plate}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Button full size="lg" onClick={() => goTo('wizard')} className="text-[16px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Заказать поездку
          </Button>
        </motion.div>

        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[13px] font-medium text-[var(--tg-text-secondary)]">История поездок</p>
            <span className="text-[12px] text-[var(--tg-text-secondary)]">{currentUser.tripsCount} поездок</span>
          </div>
          <div className="flex flex-col gap-2">
            {orderHistory.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.05 }}
              >
                <Card className="cursor-pointer p-3" onClick={() => openOrder(order.id)}>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--tg-text)]">
                        {order.from.addressText} → {order.to.addressText}
                      </p>
                      <p className="text-[11px] text-[var(--tg-text-secondary)]">
                        {formatDateShort(order.scheduledAt)}, {formatTime(order.scheduledAt)}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
