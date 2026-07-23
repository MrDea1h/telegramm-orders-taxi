import { auth } from '../lib/api'
import { haptics } from '../lib/haptics'

interface LogoutButtonProps {
  variant?: 'light' | 'default'
}

export function LogoutButton({ variant = 'default' }: LogoutButtonProps) {
  return (
    <button
      onClick={() => {
        haptics.impact('light')
        void auth.logout()
      }}
      aria-label="Выйти из аккаунта"
      className={
        variant === 'light'
          ? 'flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white'
          : 'flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tg-surface)] text-[var(--tg-text-secondary)]'
      }
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
