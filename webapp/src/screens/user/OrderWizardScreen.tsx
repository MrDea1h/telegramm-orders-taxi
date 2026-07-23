import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { TopBar } from '../../components/ui/TopBar'
import { WizardStepper } from '../../components/ui/WizardStepper'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { RouteMap } from '../../components/ui/RouteMap'
import { SuccessCheck } from '../../components/ui/SuccessCheck'
import { Avatar } from '../../components/ui/Avatar'
import { ApiError, routing, type Address } from '../../lib/api'
import { geocodeAddress, reverseGeocode } from '../../lib/yandexGeocoder'
import { fetchSuggestions, type Suggestion } from '../../lib/yandexSuggest'
import { MapAddressPicker } from '../../components/MapAddressPicker'
import { useFavoriteAddresses, useRecentAddresses, useTouchAddress } from '../../hooks/useAddresses'
import { useDrivers } from '../../hooks/useDrivers'
import { useCreateOrder, useSlots } from '../../hooks/useOrders'
import { haptics } from '../../lib/haptics'
import { useAppStore } from '../../store/appStore'

const STEP_LABELS = ['Адреса', 'Время в пути', 'Дата и время', 'Подтверждение']
const AVATAR_PALETTE = ['#7C3AED', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4']

function colorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function toDateInputValue(d: Date): string {
  return d.toISOString().slice(0, 10)
}

// Hard rule, not a UI nicety — the backend rejects weekend bookings
// outright (see api/app/orders_api.py's _is_weekend), so weekend days are
// left out of the picker entirely rather than shown and then rejected.
function isWeekday(d: Date): boolean {
  return d.getDay() !== 0 && d.getDay() !== 6
}

function firstWeekdayFromToday(): Date {
  const d = new Date()
  while (!isWeekday(d)) d.setDate(d.getDate() + 1)
  return d
}

function makeSyntheticAddress(addressText: string, coords: [number, number] | null): Address {
  return {
    id: `custom-${addressText}`,
    label: null,
    address_text: addressText,
    lat: coords?.[0] ?? null,
    lon: coords?.[1] ?? null,
    is_favorite: false,
    last_used_at: null,
  }
}

export function OrderWizardScreen() {
  const goTo = useAppStore((s) => s.goTo)
  const queryClient = useQueryClient()
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  const reverseGeocodeRequestId = useRef(0)

  const [step, setStep] = useState(0)
  const [from, setFrom] = useState<Address | null>(null)
  const [to, setTo] = useState<Address | null>(null)
  const [pickingFor, setPickingFor] = useState<'from' | 'to' | null>(null)
  const [addressQuery, setAddressQuery] = useState('')
  const [pickedCoords, setPickedCoords] = useState<[number, number] | null>(null)
  const [mapInitialCenter, setMapInitialCenter] = useState<[number, number] | null>(null)
  // 'idle': haven't tried yet (or typing again after confirming/cancelling).
  // 'loading': geocoding the typed text right now.
  // 'refining': always shown after that, whether geocoding found the address
  // or not — the map is the final step where the exact pickup/drop-off
  // point gets pinned, not just a fallback for a failed lookup.
  const [geocodeStatus, setGeocodeStatus] = useState<'idle' | 'loading' | 'refining'>('idle')
  const [mapResolvedLabel, setMapResolvedLabel] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(firstWeekdayFromToday()))
  const [slotTime, setSlotTime] = useState<string | null>(null)
  const [driverChoice, setDriverChoice] = useState<'any' | string>('any')
  const [passengers, setPassengers] = useState(1)
  const [comment, setComment] = useState('')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)

  const { data: favorites } = useFavoriteAddresses()
  const { data: recents } = useRecentAddresses()
  const touchAddress = useTouchAddress()
  const { data: driverList } = useDrivers()
  const createOrder = useCreateOrder()

  const { data: eta, isLoading: etaLoading } = useQuery({
    queryKey: ['eta', from?.address_text, from?.lat, from?.lon, to?.address_text, to?.lat, to?.lon],
    // Real driving distance/duration comes from the backend (OpenRouteService,
    // see api/app/routing_api.py) — it owns geocoding + routing + the
    // haversine fallback, so the wizard just calls it and shows whatever
    // is_estimated flag comes back.
    queryFn: () =>
      routing.eta({
        from_address: from!.address_text,
        from_lat: from!.lat ?? undefined,
        from_lon: from!.lon ?? undefined,
        to_address: to!.address_text,
        to_lat: to!.lat ?? undefined,
        to_lon: to!.lon ?? undefined,
      }),
    enabled: step >= 1 && !!from && !!to,
  })

  const { data: slots, isLoading: slotsLoading } = useSlots(
    step >= 2 ? selectedDate : null,
    undefined,
    eta?.duration_min ?? 30,
    from?.lat ?? undefined,
    from?.lon ?? undefined,
  )

  // Live suggestions (businesses, landmarks, addresses) as the user types —
  // debounced so we're not firing a request per keystroke. Only while
  // actively typing a new address; hidden once geocoding starts/finishes.
  useEffect(() => {
    if (geocodeStatus !== 'idle' || !addressQuery.trim()) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      fetchSuggestions(addressQuery.trim()).then((results) => {
        if (!cancelled) setSuggestions(results)
      })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [addressQuery, geocodeStatus])

  const horizonDays = slots?.booking_horizon_days ?? 14
  const dayOptions = useMemo(
    () =>
      Array.from({ length: horizonDays + 1 })
        .map((_, i) => {
          const d = new Date()
          d.setDate(d.getDate() + i)
          return d
        })
        .filter(isWeekday),
    [horizonDays],
  )

  function selectAddress(address: Address) {
    haptics.selection()
    if (pickingFor === 'from') setFrom(address)
    else setTo(address)
    setPickingFor(null)
    setAddressQuery('')
    setPickedCoords(null)
    setMapInitialCenter(null)
    setGeocodeStatus('idle')
    setMapResolvedLabel(null)
    touchAddress.mutate({
      addressText: address.address_text,
      lat: address.lat ?? undefined,
      lon: address.lon ?? undefined,
    })
  }

  async function handleUseTypedAddress() {
    const text = addressQuery.trim()
    if (!text) return
    setGeocodeStatus('loading')
    const result = await geocodeAddress(text)
    if (result) {
      setPickedCoords(result.coords)
      setMapInitialCenter(result.coords)
      setMapResolvedLabel(result.formattedAddress || text)
    } else {
      setPickedCoords(null)
      setMapInitialCenter(null)
      setMapResolvedLabel(null)
    }
    // Always land on the map for a final refinement tap, whether the
    // address resolved automatically or not — see the geocodeStatus
    // field's own comment for why.
    setGeocodeStatus('refining')
  }

  async function handleSelectSuggestion(suggestion: Suggestion) {
    setAddressQuery(suggestion.title)
    setSuggestions([])
    setGeocodeStatus('loading')
    // Geocode the address portion, never the business/place name itself —
    // the plain Geocoder ignores business names entirely and matches only
    // the city (verified directly), so this is the only combination that
    // reliably resolves a suggestion like a restaurant or shop.
    const result = await geocodeAddress(suggestion.addressText)
    if (result) {
      setPickedCoords(result.coords)
      setMapInitialCenter(result.coords)
      setMapResolvedLabel(suggestion.title)
    } else {
      setPickedCoords(null)
      setMapInitialCenter(null)
      setMapResolvedLabel(null)
    }
    setGeocodeStatus('refining')
  }

  function handleMapCoordsChange(coords: [number, number]) {
    setPickedCoords(coords)
    setMapResolvedLabel(null)
    const requestId = ++reverseGeocodeRequestId.current
    reverseGeocode(coords[0], coords[1]).then((label) => {
      if (reverseGeocodeRequestId.current !== requestId) return
      setMapResolvedLabel(label)
      // The whole point of showing this back to the user is so the picked
      // point reads as a real address, not just a coordinate pair — put it
      // where they're actually looking: the search field itself.
      if (label) setAddressQuery(label)
    })
  }

  const canContinue = [!!from && !!to, true, !!slotTime, true][step]

  async function handleSubmit() {
    if (!from || !to || !slotTime) return
    setSubmitError(null)
    try {
      const created = await createOrder.mutateAsync({
        idempotency_key: idempotencyKeyRef.current,
        from_address: from.address_text,
        from_lat: from.lat ?? undefined,
        from_lon: from.lon ?? undefined,
        to_address: to.address_text,
        to_lat: to.lat ?? undefined,
        to_lon: to.lon ?? undefined,
        scheduled_at: slotTime,
        est_duration_min: eta?.duration_min,
        est_distance_km: eta?.distance_km,
        passengers,
        comment: comment || undefined,
        driver_id: driverChoice === 'any' ? null : driverChoice,
      })
      haptics.notification('success')
      setCreatedOrderId(created.id)
    } catch (err) {
      haptics.notification('error')
      if (err instanceof ApiError && err.code === 'SLOT_CONFLICT') {
        setSubmitError('Этот слот только что заняли — выберите другое время.')
        await queryClient.invalidateQueries({ queryKey: ['orders', 'slots'] })
        setSlotTime(null)
        setStep(2)
      } else {
        setSubmitError('Не удалось создать заказ. Попробуйте ещё раз.')
      }
    }
  }

  if (createdOrderId) {
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
      <TopBar title="Заказ поездки" onBack={() => (step === 0 ? goTo('home') : setStep((s) => s - 1))} />
      <WizardStepper step={step} total={4} />
      <p className="px-4 pb-3 text-[12px] font-medium uppercase tracking-wide text-[var(--tg-text-secondary)]">
        Шаг {step + 1} из 4 · {STEP_LABELS[step]}
      </p>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="s0"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex flex-col gap-4"
            >
              <AddressField
                label="Откуда"
                value={from}
                onPick={() => {
                  setAddressQuery('')
                  setPickedCoords(null)
                  setPickingFor('from')
                }}
              />
              <AddressField
                label="Куда"
                value={to}
                onPick={() => {
                  setAddressQuery('')
                  setPickedCoords(null)
                  setPickingFor('to')
                }}
              />

              {pickingFor && (
                <Card className="p-3">
                  <div className="relative mb-3">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tg-text-secondary)]"
                    >
                      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <input
                      autoFocus
                      value={addressQuery}
                      onChange={(e) => {
                        setAddressQuery(e.target.value)
                        setGeocodeStatus('idle')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && addressQuery.trim() && geocodeStatus !== 'loading') {
                          handleUseTypedAddress()
                        }
                      }}
                      placeholder="Введите адрес или ориентир"
                      className="h-11 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] pl-9 pr-3 text-[13px] text-[var(--tg-text)] outline-none focus:border-primary"
                    />
                  </div>

                  {addressQuery.trim() ? (
                    <div className="flex flex-col gap-3">
                      {geocodeStatus !== 'refining' ? (
                        <>
                          {suggestions.length > 0 && (
                            <div className="flex flex-col gap-1">
                              {suggestions.map((s, i) => (
                                <button
                                  key={`${s.title}-${i}`}
                                  onClick={() => handleSelectSuggestion(s)}
                                  className="flex flex-col items-start rounded-xl px-2 py-2 text-left active:bg-black/5 dark:active:bg-white/5"
                                >
                                  <span className="text-[13px] font-medium text-[var(--tg-text)]">{s.title}</span>
                                  <span className="truncate text-[11px] text-[var(--tg-text-secondary)]">
                                    {s.subtitle}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          <button
                            disabled={geocodeStatus === 'loading'}
                            onClick={handleUseTypedAddress}
                            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 px-2 py-2 text-center text-[13px] font-medium text-primary active:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {geocodeStatus === 'loading' ? (
                              <>
                                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                Ищем «{addressQuery.trim()}»…
                              </>
                            ) : (
                              <>Использовать «{addressQuery.trim()}» как есть</>
                            )}
                          </button>
                        </>
                      ) : (
                        <>
                          {!pickedCoords && !mapInitialCenter && (
                            <p className="text-[12px] text-danger">
                              Не нашли такой адрес автоматически — уточните точку на карте.
                            </p>
                          )}
                          <p className="text-[12px] text-[var(--tg-text-secondary)]">
                            Передвиньте карту так, чтобы метка встала на точное место подачи.
                          </p>
                          <MapAddressPicker
                            initialCenter={mapInitialCenter ?? undefined}
                            onChange={handleMapCoordsChange}
                          />
                          <p className="text-center text-[12px] font-medium text-[var(--tg-text)]">
                            {mapResolvedLabel ??
                              (pickedCoords
                                ? `📍 ${pickedCoords[0].toFixed(5)}, ${pickedCoords[1].toFixed(5)}`
                                : 'Определяем координаты…')}
                          </p>
                          <button
                            disabled={!pickedCoords}
                            onClick={() =>
                              pickedCoords &&
                              selectAddress(
                                makeSyntheticAddress(mapResolvedLabel ?? addressQuery.trim(), pickedCoords),
                              )
                            }
                            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 px-2 py-2 text-center text-[13px] font-medium text-primary active:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Подтвердить точку
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Избранные адреса</p>
                      <div className="flex flex-col gap-1">
                        {favorites?.length ? (
                          favorites.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => selectAddress(a)}
                              className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] active:bg-black/5 dark:active:bg-white/5"
                            >
                              <span className="text-primary">★</span>
                              <span className="font-medium text-[var(--tg-text)]">{a.label ?? 'Адрес'}</span>
                              <span className="truncate text-[var(--tg-text-secondary)]">{a.address_text}</span>
                            </button>
                          ))
                        ) : (
                          <p className="text-[12px] text-[var(--tg-text-secondary)]">Нет избранных адресов</p>
                        )}
                      </div>
                      <p className="mb-2 mt-3 text-[12px] font-medium text-[var(--tg-text-secondary)]">Недавние</p>
                      <div className="flex flex-col gap-1">
                        {recents?.length ? (
                          recents.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => selectAddress(a)}
                              className="flex items-center gap-2 rounded-xl px-2 py-2 text-left text-[13px] text-[var(--tg-text)] active:bg-black/5 dark:active:bg-white/5"
                            >
                              <span className="text-[var(--tg-text-secondary)]">⏱</span>
                              {a.address_text}
                            </button>
                          ))
                        ) : (
                          <p className="text-[12px] text-[var(--tg-text-secondary)]">Пока нет недавних адресов</p>
                        )}
                      </div>
                    </>
                  )}
                </Card>
              )}
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="s1"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex flex-col gap-4"
            >
              <RouteMap />
              <Card className="flex items-center justify-between p-4">
                <div>
                  <p className="text-[13px] text-[var(--tg-text-secondary)]">Примерное время в пути</p>
                  <p className="text-[22px] font-semibold text-[var(--tg-text)]">
                    {etaLoading ? '…' : `≈ ${eta?.duration_min ?? '—'} мин`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[13px] text-[var(--tg-text-secondary)]">Расстояние</p>
                  <p className="text-[16px] font-medium text-[var(--tg-text)]">
                    {etaLoading ? '…' : (eta?.distance_km ?? '—')} км
                  </p>
                </div>
              </Card>
              <p className="px-1 text-[12px] text-[var(--tg-text-secondary)]">
                {eta?.is_estimated
                  ? 'Приблизительная оценка (по прямой, с запасом). Точное время зависит от трафика.'
                  : 'Реальный маршрут по дорогам. Без учёта текущих пробок.'}
              </p>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="s2"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex flex-col gap-4"
            >
              <div className="flex gap-2 overflow-x-auto pb-1">
                {dayOptions.map((d) => {
                  const iso = toDateInputValue(d)
                  return (
                    <button
                      key={iso}
                      onClick={() => {
                        setSelectedDate(iso)
                        setSlotTime(null)
                      }}
                      className={`flex shrink-0 flex-col items-center rounded-2xl px-3 py-2 text-[12px] ${
                        iso === selectedDate
                          ? 'bg-gradient-to-br from-primary to-secondary text-white'
                          : 'bg-[var(--tg-surface)] text-[var(--tg-text)]'
                      }`}
                    >
                      <span className="opacity-80">{d.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
                      <span className="text-[15px] font-semibold">{d.getDate()}</span>
                    </button>
                  )
                })}
              </div>

              <div>
                <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Свободные слоты</p>
                {slotsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : slots?.times.length ? (
                  <div className="grid grid-cols-3 gap-2">
                    {slots.times.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          haptics.selection()
                          setSlotTime(t)
                        }}
                        className={`rounded-xl border py-2.5 text-[14px] font-medium transition-colors ${
                          slotTime === t
                            ? 'border-primary bg-primary text-white'
                            : 'border-[var(--tg-border)] text-[var(--tg-text)] active:bg-black/5 dark:active:bg-white/5'
                        }`}
                      >
                        {new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-[13px] text-[var(--tg-text-secondary)]">
                    На этот день свободных слотов нет — попробуйте другую дату
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="s3"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              className="flex flex-col gap-4"
            >
              <Card className="flex flex-col gap-2 p-4">
                <Row label="Откуда" value={from?.address_text ?? '—'} />
                <Row label="Куда" value={to?.address_text ?? '—'} />
                <Row
                  label="Когда"
                  value={slotTime ? new Date(slotTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                />
                <Row label="Время в пути" value={eta ? `≈ ${eta.duration_min} мин · ${eta.distance_km} км` : '—'} />
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
                  {driverList?.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => setDriverChoice(d.id)}
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${
                        driverChoice === d.id ? 'border-primary bg-primary/5' : 'border-[var(--tg-border)]'
                      }`}
                    >
                      <Avatar name={d.full_name ?? '?'} color={colorForId(d.id)} size={32} />
                      <div>
                        <p className="text-[13px] font-medium text-[var(--tg-text)]">{d.full_name ?? 'Водитель'}</p>
                        {d.car_model && (
                          <p className="text-[11px] text-[var(--tg-text-secondary)]">{d.car_model}</p>
                        )}
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

              {submitError && <p className="text-[13px] text-danger">{submitError}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="border-t border-[var(--tg-border)] p-4">
        <Button
          full
          size="lg"
          disabled={!canContinue || createOrder.isPending}
          onClick={() => {
            if (step < 3) {
              setStep((s) => s + 1)
            } else {
              void handleSubmit()
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
        <p className="truncate text-[14px] text-[var(--tg-text)]">{value?.address_text ?? 'Выбрать адрес'}</p>
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
