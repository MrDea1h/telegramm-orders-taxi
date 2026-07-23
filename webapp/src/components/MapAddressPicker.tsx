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

const MAP_LOAD_TIMEOUT_MS = 8000
const GEOLOCATION_TIMEOUT_MS = 3000

/**
 * "Drag the map, not the pin" picker — the marker is a fixed CSS overlay at
 * screen center, and the map itself pans underneath it; the picked point is
 * always `map.getCenter()`. This sidesteps needing a draggable ymaps
 * Placemark (extra event wiring for no real benefit here) and is the same
 * pattern most ride-hailing apps use for this exact picker.
 *
 * Reverse-geocoding the picked point into a real address label is the
 * caller's job (see lib/yandexGeocoder.ts) — this component only ever
 * produces coordinates.
 *
 * Two independent hard timeouts guard against hanging forever on flaky
 * mobile WebViews: `getCurrentPosition`'s own `timeout` option isn't
 * reliably honored everywhere, and `loadYandexMaps()` has no timeout of
 * its own (computeRouteEta in yandexMaps.ts races its own copy of the same
 * load for the same reason — script load or `ymaps.ready()` can just never
 * settle on some devices/networks).
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

      const timeout = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), MAP_LOAD_TIMEOUT_MS)
      })

      Promise.race([ymapsPromise, timeout])
        .then((ymaps) => {
          if (cancelled || !containerRef.current) return
          if (!ymaps) {
            console.warn('[MapAddressPicker] Yandex Maps JS API load timed out')
            setUnavailable(true)
            return
          }
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
        .catch((error) => {
          console.warn('[MapAddressPicker] failed to load Yandex Maps JS API', error)
          if (!cancelled) setUnavailable(true)
        })
    }

    let geolocationSettled = false
    function fallbackToDefault() {
      if (geolocationSettled) return
      geolocationSettled = true
      init(DEFAULT_CENTER)
    }

    if (navigator.geolocation) {
      setTimeout(fallbackToDefault, GEOLOCATION_TIMEOUT_MS + 500)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (geolocationSettled) return
          geolocationSettled = true
          init([pos.coords.latitude, pos.coords.longitude])
        },
        fallbackToDefault,
        { timeout: GEOLOCATION_TIMEOUT_MS },
      )
    } else {
      fallbackToDefault()
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
