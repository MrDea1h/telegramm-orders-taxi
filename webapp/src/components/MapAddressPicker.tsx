import { useEffect, useRef, useState } from 'react'
import { loadYandexMaps } from '../lib/yandexMaps'

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423] // Moscow, used only if geolocation is unavailable/denied

function PinIcon() {
  return (
    <svg width="28" height="36" viewBox="0 0 24 32" fill="none">
      <path
        d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z"
        fill="#EF4444"
      />
      <circle cx="12" cy="12" r="4.5" fill="white" />
    </svg>
  )
}

/**
 * "Drag the map, not the pin" picker — the marker is a fixed CSS overlay at
 * screen center, and the map itself pans underneath it; the picked point is
 * always `map.getCenter()`. This sidesteps needing a draggable ymaps
 * Placemark (extra event wiring for no real benefit here) and is the same
 * pattern most ride-hailing apps use for this exact picker.
 *
 * There's no reverse-geocoding on this account's keys (see yandexMaps.ts) —
 * this component only ever produces coordinates, never an address label;
 * callers keep using the user's own typed text for the human-readable side.
 */
export function MapAddressPicker({ onChange }: { onChange: (coords: [number, number]) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let cancelled = false
    let map: { destroy?(): void } | null = null

    function init(center: [number, number]) {
      const ymapsPromise = loadYandexMaps()
      if (!ymapsPromise) {
        setUnavailable(true)
        return
      }
      ymapsPromise
        .then((ymaps) => {
          if (cancelled || !containerRef.current) return
          const instance = new ymaps.Map(containerRef.current, {
            center,
            zoom: 16,
            controls: ['zoomControl'],
          })
          map = instance
          setReady(true)
          const emitCenter = () => onChange(instance.getCenter())
          instance.events.add('actionend', emitCenter)
          emitCenter()
        })
        .catch(() => {
          if (!cancelled) setUnavailable(true)
        })
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => init([pos.coords.latitude, pos.coords.longitude]),
        () => init(DEFAULT_CENTER),
        { timeout: 3000 },
      )
    } else {
      init(DEFAULT_CENTER)
    }

    return () => {
      cancelled = true
      map?.destroy?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (unavailable) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--tg-border)] p-3 text-center text-[12px] text-[var(--tg-text-secondary)]">
        Карта недоступна — точные координаты не будут сохранены, время в пути будет приблизительным.
      </p>
    )
  }

  return (
    <div className="relative h-48 overflow-hidden rounded-xl border border-[var(--tg-border)]">
      <div ref={containerRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
        <PinIcon />
      </div>
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--tg-bg)]/70 text-[12px] text-[var(--tg-text-secondary)]">
          Загрузка карты…
        </div>
      )}
    </div>
  )
}
