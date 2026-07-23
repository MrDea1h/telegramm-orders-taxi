import { useEffect, useRef } from 'react'
import { ApiError, auth } from '../lib/api'
import { useAppStore } from '../store/appStore'
import { haptics } from '../lib/haptics'

declare global {
  interface Window {
    onApexRideTelegramAuth?: (user: Record<string, unknown>) => void
  }
}

/**
 * Embeds Telegram's official Login Widget (https://core.telegram.org/widgets/login).
 * Requires the bot to have a public username and `/setdomain` configured via
 * BotFather — renders nothing at all (rather than a broken/dead button) if
 * VITE_TELEGRAM_BOT_USERNAME isn't set, e.g. in local dev without a bot.
 */
export function TelegramLoginButton({ onError }: { onError?: (code: string) => void } = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const setAuth = useAppStore((s) => s.setAuth)
  const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME

  useEffect(() => {
    if (!botUsername || !containerRef.current) return

    window.onApexRideTelegramAuth = async (tgUser) => {
      try {
        const result = await auth.telegramLoginWidget(tgUser)
        haptics.notification('success')
        setAuth({ access_token: result.access_token, refresh_token: result.refresh_token }, result.user)
      } catch (err) {
        haptics.notification('error')
        onError?.(err instanceof ApiError ? err.code : 'UNKNOWN')
      }
    }

    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', botUsername)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-radius', '16')
    script.setAttribute('data-onauth', 'onApexRideTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    containerRef.current.appendChild(script)

    return () => {
      delete window.onApexRideTelegramAuth
    }
  }, [botUsername, setAuth, onError])

  if (!botUsername) return null

  return <div ref={containerRef} className="flex justify-center" />
}
