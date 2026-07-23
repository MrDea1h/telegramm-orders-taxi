import { useEffect, useState } from 'react'
import { TopBar } from '../../components/ui/TopBar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useMySchedule, useSetMySchedule } from '../../hooks/useDrivers'
import { useAppStore } from '../../store/appStore'
import { haptics } from '../../lib/haptics'
import { ApiError } from '../../lib/api'

// Monday-Friday only (weekday 0-4) — a hard, system-wide rule (see
// api/app/orders_api.py's _is_weekend and drivers_api.py's ScheduleWindow),
// not a per-driver preference, so there's no weekend row to even offer here.
const WEEKDAY_LABELS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница']

interface DayRow {
  enabled: boolean
  start: string
  end: string
}

function defaultRows(): DayRow[] {
  return Array.from({ length: 5 }, () => ({ enabled: false, start: '09:00', end: '18:00' }))
}

export function DriverScheduleScreen() {
  const goToDriverScreen = useAppStore((s) => s.goToDriverScreen)
  const { data: schedule, isLoading } = useMySchedule()
  const setSchedule = useSetMySchedule()
  const [rows, setRows] = useState<DayRow[]>(defaultRows)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!schedule) return
    const next = defaultRows()
    for (const window of schedule) {
      if (window.weekday < 0 || window.weekday > 4) continue
      next[window.weekday] = {
        enabled: true,
        start: window.start_time.slice(0, 5),
        end: window.end_time.slice(0, 5),
      }
    }
    setRows(next)
  }, [schedule])

  function updateRow(index: number, patch: Partial<DayRow>) {
    setSaved(false)
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleSave() {
    setError(null)
    const windows = rows
      .map((row, weekday) => ({ ...row, weekday }))
      .filter((row) => row.enabled)
      .map((row) => ({ weekday: row.weekday, start_time: `${row.start}:00`, end_time: `${row.end}:00` }))

    if (windows.some((w) => w.start_time >= w.end_time)) {
      setError('Время начала должно быть раньше времени окончания')
      return
    }

    haptics.impact('medium')
    try {
      await setSchedule.mutateAsync(windows)
      haptics.notification('success')
      setSaved(true)
    } catch (e) {
      haptics.notification('error')
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить график')
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <TopBar title="Мой график" onBack={() => goToDriverScreen('today')} />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-3 text-[12px] text-[var(--tg-text-secondary)]">
          Рабочие часы по будням — заказы предлагаются только в эти окна. Выходные недоступны для заказов
          во всём приложении.
        </p>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {WEEKDAY_LABELS.map((label, i) => (
              <Card key={label} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-[var(--tg-text)]">{label}</span>
                  <button
                    onClick={() => {
                      haptics.selection()
                      updateRow(i, { enabled: !rows[i].enabled })
                    }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      rows[i].enabled ? 'bg-primary' : 'bg-[var(--tg-border)]'
                    }`}
                    aria-label={`${label}: ${rows[i].enabled ? 'рабочий день' : 'выходной'}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        rows[i].enabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                {rows[i].enabled && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="time"
                      value={rows[i].start}
                      onChange={(e) => updateRow(i, { start: e.target.value })}
                      className="h-10 flex-1 rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-2 text-[13px] text-[var(--tg-text)] outline-none focus:border-primary"
                    />
                    <span className="text-[var(--tg-text-secondary)]">—</span>
                    <input
                      type="time"
                      value={rows[i].end}
                      onChange={(e) => updateRow(i, { end: e.target.value })}
                      className="h-10 flex-1 rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-2 text-[13px] text-[var(--tg-text)] outline-none focus:border-primary"
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        {saved && !error && <p className="mt-3 text-[13px] text-success">График сохранён.</p>}
      </div>
      <div className="border-t border-[var(--tg-border)] p-4">
        <Button size="lg" full disabled={setSchedule.isPending} onClick={handleSave}>
          {setSchedule.isPending ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </div>
    </div>
  )
}
