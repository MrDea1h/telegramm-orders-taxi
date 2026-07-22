import { useState } from 'react'
import { motion } from 'framer-motion'
import { TabStrip } from '../../components/ui/TabStrip'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Avatar } from '../../components/ui/Avatar'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatRelative, formatTime } from '../../lib/format'
import {
  adminUsers,
  driverQueue,
  topRoutes,
  upcomingOrder,
  verificationRequests,
  weeklyTrips,
} from '../../data/mock'
import { haptics } from '../../lib/haptics'

type Tab = 'requests' | 'users' | 'orders' | 'stats' | 'settings'

export function AdminScreen() {
  const [tab, setTab] = useState<Tab>('requests')
  const [requests, setRequests] = useState(verificationRequests)

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-[18px] font-semibold text-[var(--tg-text)]">Админ-панель</h1>
      </div>
      <TabStrip
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'requests', label: 'Заявки', badge: requests.length },
          { key: 'users', label: 'Пользователи' },
          { key: 'orders', label: 'Заказы' },
          { key: 'stats', label: 'Статистика' },
          { key: 'settings', label: 'Настройки' },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'requests' &&
          (requests.length ? (
            <div className="flex flex-col gap-3">
              {requests.map((r) => (
                <Card key={r.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.fullName} color="#7C3AED" size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[var(--tg-text)]">{r.fullName}</p>
                      <p className="truncate text-[12px] text-[var(--tg-text-secondary)]">
                        {r.email ?? r.phone} · {r.tgUsername}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--tg-text-secondary)]">
                      {formatRelative(r.requestedAt)}
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="danger"
                      size="md"
                      full
                      onClick={() => {
                        haptics.impact('medium')
                        setRequests((rs) => rs.filter((x) => x.id !== r.id))
                      }}
                    >
                      Отклонить
                    </Button>
                    <Button
                      size="md"
                      full
                      onClick={() => {
                        haptics.notification('success')
                        setRequests((rs) => rs.filter((x) => x.id !== r.id))
                      }}
                    >
                      Одобрить
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              }
              title="Заявок нет"
              subtitle="Все запросы на доступ обработаны"
            />
          ))}

        {tab === 'users' && (
          <div className="flex flex-col gap-2">
            {adminUsers.map((u) => (
              <Card key={u.id} className="flex items-center gap-3 p-3">
                <Avatar name={u.fullName} color={u.role === 'driver' ? '#3B82F6' : '#7C3AED'} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[var(--tg-text)]">{u.fullName}</p>
                  <p className="text-[11px] text-[var(--tg-text-secondary)]">
                    {u.role === 'driver' ? 'Водитель' : u.role === 'admin' ? 'Админ' : 'Сотрудник'} · {u.tripsCount} поездок
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                    u.status === 'blocked' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'
                  }`}
                >
                  {u.status === 'blocked' ? 'Заблокирован' : 'Активен'}
                </span>
              </Card>
            ))}
          </div>
        )}

        {tab === 'orders' && (
          <div className="flex flex-col gap-2">
            {[upcomingOrder, ...driverQueue].map((o) => (
              <Card key={o.id} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-[var(--tg-text)]">{formatTime(o.scheduledAt)}</p>
                  <StatusBadge status={o.status} />
                </div>
                <p className="mt-1 truncate text-[12px] text-[var(--tg-text-secondary)]">
                  {o.from.addressText} → {o.to.addressText}
                </p>
                <p className="mt-1 text-[11px] text-[var(--tg-text-secondary)]">Заказчик: {o.createdByName}</p>
              </Card>
            ))}
          </div>
        )}

        {tab === 'stats' && (
          <div className="flex flex-col gap-4">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[13px] font-medium text-[var(--tg-text)]">Поездки за неделю</p>
                <Button variant="secondary" size="md" className="!h-8 !px-3 !text-[12px]">
                  Экспорт CSV
                </Button>
              </div>
              <div className="flex items-end gap-2" style={{ height: 96 }}>
                {weeklyTrips.map((d, i) => (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${(d.count / 18) * 72}px` }}
                      transition={{ delay: i * 0.05, duration: 0.4 }}
                      className="w-full rounded-t-md bg-gradient-to-t from-primary to-secondary"
                    />
                    <span className="text-[10px] text-[var(--tg-text-secondary)]">{d.day}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-[13px] font-medium text-[var(--tg-text)]">Топ маршрутов</p>
              <div className="flex flex-col gap-2">
                {topRoutes.map((r) => (
                  <div key={r.route} className="flex items-center justify-between text-[12px]">
                    <span className="truncate pr-2 text-[var(--tg-text-secondary)]">{r.route}</span>
                    <span className="shrink-0 font-medium text-[var(--tg-text)]">{r.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}

        {tab === 'settings' && (
          <div className="flex flex-col gap-2">
            <SettingRow label="Рабочие часы сервиса" value="08:00 – 22:00" />
            <SettingRow label="Горизонт бронирования" value="14 дней" />
            <SettingRow label="Мин. время до поездки" value="30 мин" />
            <SettingRow label="Буфер между поездками" value="15 мин" />
            <SettingRow label="Тайм-аут принятия заказа" value="10 мин" />
          </div>
        )}
      </div>
    </div>
  )
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <Card className="flex items-center justify-between p-3.5">
      <span className="text-[13px] text-[var(--tg-text)]">{label}</span>
      <span className="text-[13px] font-medium text-primary">{value}</span>
    </Card>
  )
}
