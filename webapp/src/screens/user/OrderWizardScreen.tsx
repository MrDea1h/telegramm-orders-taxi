import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TopBar } from '../../components/ui/TopBar'
import { WizardStepper } from '../../components/ui/WizardStepper'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { RouteMap } from '../../components/ui/RouteMap'
import { SuccessCheck } from '../../components/ui/SuccessCheck'
import { Avatar } from '../../components/ui/Avatar'
import { favoriteAddresses, recentAddresses, drivers, timeSlots } from '../../data/mock'
import type { Address } from '../../data/types'
import { haptics } from '../../lib/haptics'
import { useAppStore } from '../../store/appStore'

const STEP_LABELS = ['Адреса', 'Время в пути', 'Дата и время', 'Подтверждение']

const next7Days = Array.from({ length: 7 }).map((_, i) => {
  const d = new Date()
  d.setDate(d.getDate() + i)
  return d
})

export function OrderWizardScreen() {
  const goTo = useAppStore((s) => s.goTo)
  const [step, setStep] = useState(0)
  const [from, setFrom] = useState<Address | null>(favoriteAddresses[0])
  const [to, setTo] = useState<Address | null>(null)
  const [pickingFor, setPickingFor] = useState<'from' | 'to' | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [slot, setSlot] = useState<string | null>(null)
  const [driverChoice, setDriverChoice] = useState<'any' | string>('any')
  const [passengers, setPassengers] = useState(1)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const eta = useMemo(() => ({ min: 35, km: 18 }), [from, to])

  const canContinue = [
    !!from && !!to,
    true,
    !!slot,
    true,
  ][step]

  if (submitted) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--tg-bg)] px-8 text-center">
        <SuccessCheck />
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <h2 className="text-[19px] font-semibold text-[var(--tg-text)]">Заказ создан!</h2>
          <p className="mt-1 max-w-[240px] text-[14px] text-[var(--tg-text-secondary)]">
            Отправили запрос {driverChoice === 'any' ? 'свободным водителям' : 'выбранному водителю'}. Уведомим, как
            только заказ примут.
          </p>
        </motion.div>
        <Button size="lg" className="mt-2" onClick={() => goTo('home')}>
          На главный экран
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <TopBar
        title="Заказ поездки"
        onBack={() => (step === 0 ? goTo('home') : setStep((s) => s - 1))}
      />
      <WizardStepper step={step} total={4} />
      <p className="px-4 pb-3 text-[12px] font-medium uppercase tracking-wide text-[var(--tg-text-secondary)]">
        Шаг {step + 1} из 4 · {STEP_LABELS[step]}
      </p>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="s0" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col gap-4">
              <AddressField label="Откуда" value={from} onPick={() => setPickingFor('from')} />
              <AddressField label="Куда" value={to} onPick={() => setPickingFor('to')} />

              {pickingFor && (
                <Card className="p-3">
                  <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Избранные адреса</p>
                  <div className="flex flex-col gap-1">
                    {favoriteAddresses.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          haptics.selection()
                          pickingFor === 'from' ? setFrom(a) : setTo(a)
                          setPickingFor(null)
                        }}
                        className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] active:bg-black/5 dark:active:bg-white/5"
                      >
                        <span className="text-primary">★</span>
                        <span className="font-medium text-[var(--tg-text)]">{a.label}</span>
                        <span className="truncate text-[var(--tg-text-secondary)]">{a.addressText}</span>
                      </button>
                    ))}
                  </div>
                  <p className="mb-2 mt-3 text-[12px] font-medium text-[var(--tg-text-secondary)]">Недавние</p>
                  <div className="flex flex-col gap-1">
                    {recentAddresses.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => {
                          haptics.selection()
                          pickingFor === 'from' ? setFrom(a) : setTo(a)
                          setPickingFor(null)
                        }}
                        className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] text-[var(--tg-text)] active:bg-black/5 dark:active:bg-white/5"
                      >
                        <span className="text-[var(--tg-text-secondary)]">⏱</span>
                        {a.addressText}
                      </button>
                    ))}
                  </div>
                </Card>
              )}
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col gap-4">
              <RouteMap />
              <Card className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[13px] text-[var(--tg-text-secondary)]">Примерное время в пути</p>
                  <p className="text-[22px] font-semibold text-[var(--tg-text)]">≈ {eta.min} мин</p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-[var(--tg-text-secondary)]">Расстояние</p>
                  <p className="text-[16px] font-medium text-[var(--tg-text)]">{eta.km} км</p>
                </div>
              </Card>
              <p className="px-1 text-[12px] text-[var(--tg-text-secondary)]">
                Оценка с учётом запаса ×1.2. Точное время зависит от трафика в момент поездки.
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col gap-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {next7Days.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setDayIndex(i)
                      setSlot(null)
                    }}
                    className={`flex shrink-0 flex-col items-center rounded-2xl px-3 py-2 text-[12px] ${
                      i === dayIndex ? 'bg-gradient-to-br from-primary to-secondary text-white' : 'bg-[var(--tg-surface)] text-[var(--tg-text)]'
                    }`}
                  >
                    <span className="opacity-80">{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                    <span className="text-[15px] font-semibold">{d.getDate()}</span>
                  </button>
                ))}
              </div>

              <div>
                <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Свободные слоты</p>
                <div className="grid grid-cols-3 gap-2">
                  {timeSlots.map((t) => (
                    <button
                      key={t}
                      onClick={() => {
                        haptics.selection()
                        setSlot(t)
                      }}
                      className={`rounded-xl border py-2.5 text-[14px] font-medium transition-colors ${
                        slot === t
                          ? 'border-primary bg-primary text-white'
                          : 'border-[var(--tg-border)] text-[var(--tg-text)] active:bg-black/5 dark:active:bg-white/5'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="flex flex-col gap-4">
              <Card className="flex flex-col gap-2 p-4">
                <Row label="Откуда" value={from?.addressText ?? '—'} />
                <Row label="Куда" value={to?.addressText ?? '—'} />
                <Row label="Когда" value={`${next7Days[dayIndex].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${slot ?? '—'}`} />
                <Row label="Время в пути" value={`≈ ${eta.min} мин · ${eta.km} км`} />
              </Card>

              <div>
                <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Водитель</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setDriverChoice('any')}
                    className={`flex items-center justify-between rounded-2xl border p-3 text-left ${
                      driverChoice === 'any' ? 'border-primary bg-primary/5' : 'border-[var(--tg-border)]'
                    }`}
                  >
                    <span className="text-[13px] font-medium text-[var(--tg-text)]">Любой свободный</span>
                    <span className="text-[12px] text-[var(--tg-text-secondary)]">заберёт первый принявший</span>
                  </button>
                  {drivers.filter((d) => d.isActive).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDriverChoice(d.id)}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${
                        driverChoice === d.id ? 'border-primary bg-primary/5' : 'border-[var(--tg-border)]'
                      }`}
                    >
                      <Avatar name={d.fullName} color={d.avatarColor} size={32} />
                      <div>
                        <p className="text-[13px] font-medium text-[var(--tg-text)]">{d.fullName}</p>
                        <p className="text-[11px] text-[var(--tg-text-secondary)]">{d.car.model} · ★ {d.rating}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Пассажиров</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-surface)] text-[var(--tg-text)]"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-[15px] font-medium text-[var(--tg-text)]">{passengers}</span>
                  <button
                    onClick={() => setPassengers((p) => Math.min(4, p + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-surface)] text-[var(--tg-text)]"
                  >
                    +
                  </button>
                </div>
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Комментарий к заказу (необязательно)"
                rows={2}
                className="rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 py-2 text-[13px] text-[var(--tg-text)] outline-none focus:border-primary"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-[var(--tg-border)] p-4">
        <Button
          full
          size="lg"
          disabled={!canContinue}
          onClick={() => {
            if (step < 3) {
              setStep((s) => s + 1)
            } else {
              haptics.notification('success')
              setSubmitted(true)
            }
          }}
        >
          {step < 3 ? 'Продолжить' : 'Создать заказ'}
        </Button>
      </div>
    </div>
  )
}

function AddressField({ label, value, onPick }: { label: string; value: Address | null; onPick: () => void }) {
  return (
    <button onClick={onPick} className="flex items-center gap-3 rounded-2xl border border-[var(--tg-border)] p-3 text-left">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-surface)] text-primary">
        {label === 'Откуда' ? '●' : '📍'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--tg-text-secondary)]">{label}</p>
        <p className="truncate text-[14px] text-[var(--tg-text)]">{value?.addressText ?? 'Выбрать адрес'}</p>
      </div>
    </button>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-[var(--tg-text-secondary)]">{label}</span>
      <span className="max-w-[65%] truncate text-right font-medium text-[var(--tg-text)]">{value}</span>
    </div>
  )
}
