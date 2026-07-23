import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TabStrip } from '../../components/ui/TabStrip'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Avatar } from '../../components/ui/Avatar'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatRelative, formatDateShort, formatTime } from '../../lib/format'
import { admin, ApiError, type AdminUser, type VerificationRequest } from '../../lib/api'
import { useAdminOrders, useAssignOrder, useAdminCancelOrder } from '../../hooks/useOrders'
import { useDrivers } from '../../hooks/useDrivers'
import { useAppStore } from '../../store/appStore'
import { topRoutes, weeklyTrips } from '../../data/mock'
import type { OrderStatus } from '../../data/types'
import { haptics } from '../../lib/haptics'

type Tab = 'requests' | 'users' | 'orders' | 'stats' | 'settings'

const TERMINAL_STATUSES: OrderStatus[] = [
  'completed',
  'cancelled_by_user',
  'cancelled_by_driver',
  'cancelled_by_admin',
  'expired',
]

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'pending_driver', label: 'Ожидает водителя' },
  { value: 'confirmed', label: 'Подтверждён' },
  { value: 'driver_en_route', label: 'Водитель едет' },
  { value: 'driver_arrived', label: 'Водитель на месте' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'completed', label: 'Завершён' },
  { value: 'cancelled_by_user', label: 'Отменён пользователем' },
  { value: 'cancelled_by_driver', label: 'Отменён водителем' },
  { value: 'cancelled_by_admin', label: 'Отменён админом' },
  { value: 'expired', label: 'Просрочен' },
]

const ROLE_LABEL: Record<AdminUser['role'], string> = {
  user: 'Сотрудник',
  driver: 'Водитель',
  admin: 'Админ',
}

function ErrorIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4m0 4h.01M10.29 3.86l-8.18 14.18A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.01L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export function AdminScreen() {
  const currentUserId = useAppStore((s) => s.user?.id)
  const [tab, setTab] = useState<Tab>('requests')

  const [requests, setRequests] = useState<VerificationRequest[] | null>(null)
  const [requestsError, setRequestsError] = useState<string | null>(null)
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({})

  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [driverFilter, setDriverFilter] = useState('')
  const [reassigningId, setReassigningId] = useState<string | null>(null)
  const [reassignDriverId, setReassignDriverId] = useState('')
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const {
    data: adminOrdersList,
    isLoading: adminOrdersLoading,
    error: adminOrdersError,
  } = useAdminOrders({ status: statusFilter || undefined, driver_id: driverFilter || undefined })
  const { data: driverRoster } = useDrivers()
  const assignOrder = useAssignOrder()
  const adminCancelOrder = useAdminCancelOrder()

  async function handleReassign(orderId: string) {
    haptics.impact('medium')
    await assignOrder.mutateAsync({ id: orderId, driverId: reassignDriverId || null })
    setReassigningId(null)
    setReassignDriverId('')
  }

  async function handleAdminCancel(orderId: string) {
    haptics.impact('medium')
    await adminCancelOrder.mutateAsync({ id: orderId, reason: cancelReason.trim() })
    setCancelingId(null)
    setCancelReason('')
  }

  useEffect(() => {
    admin
      .listVerificationRequests()
      .then(setRequests)
      .catch((e: unknown) => setRequestsError(e instanceof ApiError ? e.message : 'Не удалось загрузить'))
  }, [])

  useEffect(() => {
    admin
      .listUsers()
      .then(setUsers)
      .catch((e: unknown) => setUsersError(e instanceof ApiError ? e.message : 'Не удалось загрузить'))
  }, [])

  async function handleApprove(id: string) {
    haptics.notification('success')
    await admin.approveVerificationRequest(id)
    setRequests((rs) => (rs ? rs.filter((x) => x.id !== id) : rs))
    setUsers((us) => (us ? us.map((u) => (u.id === id ? { ...u, status: 'verified' } : u)) : us))
  }

  async function handleReject(id: string) {
    const reason = rejectReasons[id]?.trim()
    if (!reason) return
    haptics.impact('medium')
    await admin.rejectVerificationRequest(id, reason)
    setRequests((rs) => (rs ? rs.filter((x) => x.id !== id) : rs))
    setUsers((us) => (us ? us.map((u) => (u.id === id ? { ...u, status: 'blocked' } : u)) : us))
  }

  async function handleSetRole(userId: string, role: AdminUser['role']) {
    setRoleError(null)
    try {
      const updated = await admin.setUserRole(userId, role)
      setUsers((us) => (us ? us.map((u) => (u.id === userId ? updated : u)) : us))
    } catch (e) {
      setRoleError(e instanceof ApiError ? e.message : 'Не удалось изменить роль')
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-[18px] font-semibold text-[var(--tg-text)]">Админ-панель</h1>
      </div>
      <TabStrip
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'requests', label: 'Заявки', badge: requests?.length ?? 0 },
          { key: 'users', label: 'Пользователи' },
          { key: 'orders', label: 'Заказы' },
          { key: 'stats', label: 'Статистика' },
          { key: 'settings', label: 'Настройки' },
        ]}
      />

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'requests' &&
          (requests === null ? (
            requestsError ? (
              <EmptyState icon={<ErrorIcon />} title="Ошибка загрузки" subtitle={requestsError} />
            ) : (
              <Spinner />
            )
          ) : requests.length ? (
            <div className="flex flex-col gap-3">
              {requests.map((r) => (
                <Card key={r.id} className="p-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={r.full_name ?? `tg:${r.telegram_id}`} color="#7C3AED" size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-[var(--tg-text)]">
                        {r.full_name ?? 'Без имени'}
                      </p>
                      <p className="truncate text-[12px] text-[var(--tg-text-secondary)]">
                        {r.phone ?? `tg:${r.telegram_id}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[var(--tg-text-secondary)]">
                      {formatRelative(r.created_at)}
                    </span>
                  </div>
                  <input
                    value={rejectReasons[r.id] ?? ''}
                    onChange={(e) => setRejectReasons((m) => ({ ...m, [r.id]: e.target.value }))}
                    placeholder="Причина отказа (для отклонения)"
                    className="mt-3 w-full rounded-xl bg-[var(--tg-surface)] px-3 py-2 text-[13px] text-[var(--tg-text)] outline-none placeholder:text-[var(--tg-text-secondary)]"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="danger"
                      size="md"
                      full
                      disabled={!rejectReasons[r.id]?.trim()}
                      onClick={() => handleReject(r.id)}
                    >
                      Отклонить
                    </Button>
                    <Button size="md" full onClick={() => handleApprove(r.id)}>
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
            {roleError && (
              <p className="rounded-xl bg-danger/10 px-3 py-2 text-[12px] text-danger">{roleError}</p>
            )}
            {users === null ? (
              usersError ? (
                <EmptyState icon={<ErrorIcon />} title="Ошибка загрузки" subtitle={usersError} />
              ) : (
                <Spinner />
              )
            ) : (
              users.map((u) => (
                <Card key={u.id} className="flex flex-col gap-2 p-3">
                  <div className="flex items-center gap-3">
                    <Avatar
                      name={u.full_name ?? `tg:${u.telegram_id}`}
                      color={u.role === 'driver' ? '#3B82F6' : u.role === 'admin' ? '#F59E0B' : '#7C3AED'}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-[var(--tg-text)]">
                        {u.full_name ?? 'Без имени'}
                        {u.id === currentUserId && ' (вы)'}
                      </p>
                      <p className="truncate text-[11px] text-[var(--tg-text-secondary)]">
                        {u.phone ?? `tg:${u.telegram_id}`}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                        u.status === 'blocked'
                          ? 'bg-danger/10 text-danger'
                          : u.status === 'pending'
                            ? 'bg-black/5 text-[var(--tg-text-secondary)] dark:bg-white/10'
                            : 'bg-success/10 text-success'
                      }`}
                    >
                      {u.status === 'blocked' ? 'Заблокирован' : u.status === 'pending' ? 'Ожидает' : 'Активен'}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {(['user', 'driver', 'admin'] as const).map((role) => (
                      <Button
                        key={role}
                        variant={u.role === role ? 'primary' : 'secondary'}
                        disabled={u.id === currentUserId}
                        className="!h-8 flex-1 !px-2 !text-[12px]"
                        onClick={() => handleSetRole(u.id, role)}
                      >
                        {ROLE_LABEL[role]}
                      </Button>
                    ))}
                  </div>
                </Card>
              ))
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 flex-1 rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-2 text-[12px] text-[var(--tg-text)] outline-none"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={driverFilter}
                onChange={(e) => setDriverFilter(e.target.value)}
                className="h-9 flex-1 rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-2 text-[12px] text-[var(--tg-text)] outline-none"
              >
                <option value="">Все водители</option>
                {driverRoster?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.full_name ?? 'Водитель'}
                  </option>
                ))}
              </select>
            </div>

            {adminOrdersLoading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : adminOrdersError ? (
              <EmptyState icon={<ErrorIcon />} title="Ошибка загрузки" subtitle={adminOrdersError.message} />
            ) : adminOrdersList?.length ? (
              adminOrdersList.map((o) => {
                const terminal = TERMINAL_STATUSES.includes(o.status)
                return (
                  <Card key={o.id} className="flex flex-col gap-2 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[13px] font-medium text-[var(--tg-text)]">
                        {formatDateShort(o.scheduled_at)}, {formatTime(o.scheduled_at)}
                      </p>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="truncate text-[12px] text-[var(--tg-text-secondary)]">
                      {o.from_address} → {o.to_address}
                    </p>
                    <p className="text-[11px] text-[var(--tg-text-secondary)]">
                      Заказчик: {o.user_full_name ?? o.user_phone ?? '—'} · Водитель:{' '}
                      {o.driver_full_name ?? 'не назначен'}
                    </p>

                    {reassigningId === o.id ? (
                      <div className="flex flex-col gap-2 border-t border-[var(--tg-border)] pt-2">
                        <select
                          value={reassignDriverId}
                          onChange={(e) => setReassignDriverId(e.target.value)}
                          className="h-9 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-2 text-[12px] text-[var(--tg-text)] outline-none"
                        >
                          <option value="">Не назначен (любой свободный)</option>
                          {driverRoster?.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.full_name ?? 'Водитель'}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <Button variant="secondary" size="md" full onClick={() => setReassigningId(null)}>
                            Отмена
                          </Button>
                          <Button size="md" full onClick={() => handleReassign(o.id)}>
                            Сохранить
                          </Button>
                        </div>
                      </div>
                    ) : cancelingId === o.id ? (
                      <div className="flex flex-col gap-2 border-t border-[var(--tg-border)] pt-2">
                        <input
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="Причина отмены"
                          className="h-9 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 text-[12px] text-[var(--tg-text)] outline-none focus:border-primary"
                        />
                        <div className="flex gap-2">
                          <Button variant="secondary" size="md" full onClick={() => setCancelingId(null)}>
                            Назад
                          </Button>
                          <Button
                            variant="danger"
                            size="md"
                            full
                            disabled={!cancelReason.trim()}
                            onClick={() => handleAdminCancel(o.id)}
                          >
                            Отменить заказ
                          </Button>
                        </div>
                      </div>
                    ) : (
                      !terminal && (
                        <div className="flex gap-2 border-t border-[var(--tg-border)] pt-2">
                          <Button
                            variant="secondary"
                            size="md"
                            full
                            className="!text-[12px]"
                            onClick={() => {
                              setReassigningId(o.id)
                              setReassignDriverId(o.driver_id ?? '')
                            }}
                          >
                            Переназначить
                          </Button>
                          <Button
                            variant="danger"
                            size="md"
                            full
                            className="!text-[12px]"
                            onClick={() => setCancelingId(o.id)}
                          >
                            Отменить
                          </Button>
                        </div>
                      )
                    )}
                  </Card>
                )
              })
            ) : (
              <EmptyState
                icon={<CheckIcon />}
                title="Заказов нет"
                subtitle="По выбранным фильтрам ничего не найдено"
              />
            )}
          </div>
        )}

        {tab === 'stats' && (
          <div className="flex flex-col gap-4">
            <p className="text-[11px] text-[var(--tg-text-secondary)]">
              Демо-данные — статистика на реальных заказах появится в одном из следующих этапов
            </p>
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
