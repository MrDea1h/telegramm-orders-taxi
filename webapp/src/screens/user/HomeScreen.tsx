import { motion } from 'framer-motion'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { RouteMap } from '../../components/ui/RouteMap'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { LogoutButton } from '../../components/LogoutButton'
import { AdminViewSwitcher } from '../../components/AdminViewSwitcher'
import { PullToRefresh } from '../../components/PullToRefresh'
import { formatRelative, formatDateShort, formatTime, shortenAddress } from '../../lib/format'
import { useOrderHistory, useUpcomingOrder } from '../../hooks/useOrders'
import { useAppStore } from '../../store/appStore'

function HistoryIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Statuses where the ball is in someone else's court and the user should
// notice — the driver hasn't accepted yet, or has proposed a different time
// that needs the user's own accept/decline.
const AWAITING_CHANGE_STATUSES = new Set(['pending_driver', 'driver_countered'])

export function HomeScreen() {
  const goTo = useAppStore((s) => s.goTo)
  const openOrder = useAppStore((s) => s.openOrder)
  const user = useAppStore((s) => s.user)
  const { data: upcoming, refetch: refetchUpcoming } = useUpcomingOrder()
  const { data: history, refetch: refetchHistory } = useOrderHistory()

  const nextOrder = upcoming?.[0]
  const otherActiveOrders = upcoming?.slice(1) ?? []
  // full_name is stored "Фамилия Имя" (see the onboarding profile step) —
  // greet by the last token, not the first.
  const givenName = user?.full_name?.trim().split(/\s+/).slice(-1)[0]

  return (
    <PullToRefresh
      className="h-full pb-28"
      onRefresh={() => Promise.all([refetchUpcoming(), refetchHistory()])}
    >
      <div className="bg-gradient-to-br from-primary to-secondary px-5 pb-8 pt-6 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[13px] text-white/80">Добрый день,</p>
            <h1 className="truncate text-[20px] font-semibold">{givenName ?? 'Коллега'}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Avatar name={user?.full_name ?? '?'} color="rgba(255,255,255,0.25)" size={40} />
            <LogoutButton variant="light" />
          </div>
        </div>
        <div className="mt-3 flex justify-center">
          <AdminViewSwitcher variant="light" />
        </div>
      </div>

      <div className="-mt-5 flex flex-col gap-4 px-4">
        {nextOrder && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <Card
              className={`overflow-hidden p-0 ${
                AWAITING_CHANGE_STATUSES.has(nextOrder.status) ? 'ring-2 ring-warning' : ''
              }`}
              onClick={() => openOrder(nextOrder.id)}
            >
              <div className="cursor-pointer p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[13px] font-medium text-[var(--tg-text-secondary)]">
                    {AWAITING_CHANGE_STATUSES.has(nextOrder.status)
                      ? 'Требует вашего внимания'
                      : 'Ближайшая поездка'}
                  </p>
                  <StatusBadge status={nextOrder.status} />
                </div>
                <RouteMap compact />
                <div className="mt-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium text-[var(--tg-text)]">
                      {shortenAddress(nextOrder.from_address)}
                    </p>
                    <p className="truncate text-[12px] text-[var(--tg-text-secondary)]">
                      → {shortenAddress(nextOrder.to_address)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[13px] font-semibold text-primary">
                      {formatRelative(nextOrder.scheduled_at)}
                    </p>
                    {nextOrder.est_distance_km != null && (
                      <p className="text-[11px] text-[var(--tg-text-secondary)]">
                        ≈ {nextOrder.est_duration_min} мин · {nextOrder.est_distance_km} км
                      </p>
                    )}
                  </div>
                </div>
                {nextOrder.driver_full_name && (
                  <div className="mt-3 flex items-center gap-2 border-t border-[var(--tg-border)] pt-3">
                    <Avatar name={nextOrder.driver_full_name} color="#3B82F6" size={28} />
                    <p className="text-[12px] text-[var(--tg-text-secondary)]">
                      {nextOrder.driver_full_name}
                      {nextOrder.driver_car_model &&
                        ` · ${nextOrder.driver_car_model}, ${nextOrder.driver_car_plate}`}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {otherActiveOrders.length > 0 && (
          <div className="flex flex-col gap-2">
            {otherActiveOrders.map((order, i) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + i * 0.05 }}
              >
                <Card
                  className={`cursor-pointer p-3 ${
                    AWAITING_CHANGE_STATUSES.has(order.status) ? 'ring-2 ring-warning' : ''
                  }`}
                  onClick={() => openOrder(order.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[var(--tg-text)]">
                        {shortenAddress(order.from_address)} → {shortenAddress(order.to_address)}
                      </p>
                      <p className="text-[11px] text-[var(--tg-text-secondary)]">
                        {formatRelative(order.scheduled_at)}
                      </p>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={nextOrder ? undefined : 'mt-[6vh]'}
        >
          <Button full size="lg" onClick={() => goTo('wizard')} className="text-[16px]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Заказать поездку
          </Button>
        </motion.div>

        <div className={nextOrder ? undefined : 'mt-2'}>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[13px] font-medium text-[var(--tg-text-secondary)]">История поездок</p>
            {!!history?.length && (
              <span className="text-[12px] text-[var(--tg-text-secondary)]">{history.length} поездок</span>
            )}
          </div>

          {history && history.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon />}
              title="Пока нет поездок"
              subtitle="Закажите первую поездку кнопкой выше"
            />
          ) : (
            <div className="flex flex-col gap-2">
              {history?.map((order, i) => (
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
                          {shortenAddress(order.from_address)} → {shortenAddress(order.to_address)}
                        </p>
                        <p className="text-[11px] text-[var(--tg-text-secondary)]">
                          {formatDateShort(order.scheduled_at)}, {formatTime(order.scheduled_at)}
                        </p>
                      </div>
                      <StatusBadge status={order.status} />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  )
}
