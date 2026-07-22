import { useEffect, useRef } from 'react'
import { auth, REFRESH_TOKEN_STORAGE_KEY } from '../lib/api'
import { useAppStore } from '../store/appStore'

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
      }
    }
  }
}

/**
 * Runs once on app mount to establish (or rule out) a session:
 * 1. Inside Telegram (Mini App `initData` present) — auto-login, no user
 *    interaction needed.
 * 2. Standalone browser with a persisted refresh token — silent refresh.
 * 3. Otherwise — unauthenticated, onboarding shows.
 */
export function useAuthBootstrap() {
  const setAuth = useAppStore((s) => s.setAuth)
  const setUser = useAppStore((s) => s.setUser)
  const clearAuth = useAppStore((s) => s.clearAuth)
  const setAuthReady = useAppStore((s) => s.setAuthReady)
  const ranOnce = useRef(false)

  useEffect(() => {
    if (ranOnce.current) return
    ranOnce.current = true

    async function bootstrap() {
      const initData = window.Telegram?.WebApp?.initData
      if (initData) {
        try {
          const result = await auth.telegramInitData(initData)
          setAuth({ access_token: result.access_token, refresh_token: result.refresh_token }, result.user)
          return
        } catch {
          // Falls through to the refresh-token / unauthenticated path below
          // — e.g. initData present but stale/invalid for some reason.
        }
      }

      if (localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)) {
        const refreshed = await auth.refresh()
        if (refreshed) {
          try {
            const user = await auth.me()
            setUser(user)
            setAuthReady(true)
            return
          } catch {
            // fall through to clearAuth below
          }
        }
      }

      clearAuth()
    }

    bootstrap()
  }, [setAuth, setUser, clearAuth, setAuthReady])
}
