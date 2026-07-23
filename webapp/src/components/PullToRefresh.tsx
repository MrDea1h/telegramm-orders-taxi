import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptics } from '../lib/haptics'

const PULL_THRESHOLD = 64 // px of drag needed to trigger a refresh
const MAX_PULL = 96 // visual cap so the indicator can't be dragged off-screen
const RESISTANCE = 0.5 // rubber-band feel — finger moves further than the content does

/**
 * Custom pull-to-refresh — wraps a screen's own scrollable root. Only
 * activates when the drag starts at scrollTop === 0 and moves downward, so
 * it never fights normal scrolling once the list has moved even slightly.
 *
 * touchmove is attached natively (not as a JSX prop) specifically so
 * preventDefault() actually works — React attaches touch listeners as
 * passive by default, which silently no-ops preventDefault and lets the
 * browser's own overscroll/bounce fight our transform.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<unknown>
  children: ReactNode
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef<number | null>(null)
  const draggingRef = useRef(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function handleTouchStart(e: globalThis.TouchEvent) {
      if (refreshing) return
      if (el!.scrollTop > 0) {
        startYRef.current = null
        return
      }
      startYRef.current = e.touches[0].clientY
      draggingRef.current = false
    }

    function handleTouchMove(e: globalThis.TouchEvent) {
      if (startYRef.current == null || refreshing) return
      const delta = e.touches[0].clientY - startYRef.current
      if (delta <= 0 || el!.scrollTop > 0) {
        startYRef.current = null
        draggingRef.current = false
        setPullDistance(0)
        return
      }
      draggingRef.current = true
      e.preventDefault()
      setPullDistance(Math.min(delta * RESISTANCE, MAX_PULL))
    }

    async function handleTouchEnd() {
      if (!draggingRef.current) {
        startYRef.current = null
        return
      }
      draggingRef.current = false
      startYRef.current = null
      setPullDistance((current) => {
        if (current >= PULL_THRESHOLD) {
          haptics.impact('medium')
          setRefreshing(true)
          onRefresh().finally(() => {
            setRefreshing(false)
            setPullDistance(0)
          })
          return PULL_THRESHOLD
        }
        return 0
      })
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onRefresh, refreshing])

  const indicatorVisible = pullDistance > 4 || refreshing
  const spinning = refreshing || pullDistance >= PULL_THRESHOLD

  return (
    <div
      ref={containerRef}
      className={`relative overflow-y-auto overscroll-y-contain ${className ?? ''}`}
    >
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex justify-center pt-1"
        style={{
          transform: `translateY(${pullDistance - 56}px)`,
          opacity: indicatorVisible ? 1 : 0,
          transition: draggingRef.current ? undefined : 'transform 0.2s, opacity 0.2s',
        }}
      >
        <div
          className={`h-7 w-7 rounded-full border-2 border-primary border-t-transparent ${spinning ? 'animate-spin' : ''}`}
          style={!spinning ? { transform: `rotate(${pullDistance * 3}deg)` } : undefined}
        />
      </div>
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: draggingRef.current ? undefined : 'transform 0.2s',
        }}
      >
        {children}
      </div>
    </div>
  )
}
