import { useEffect, useRef } from 'react'
import { auth } from '../lib/api'
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
 * BotFather — neither exists yet for this project, so this renders nothing
 * at all (rather than a broken/dead button) until VITE_TELEGRAM_BOT_USERNAME
 * is set.
 */
export function TelegramLoginButton() {
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
      } catch {
        haptics.notification('error')
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
  }, [botUsername, setAuth])

  if (!botUsername) return null

  return <div ref={containerRef} className="flex justify-center" />
}
