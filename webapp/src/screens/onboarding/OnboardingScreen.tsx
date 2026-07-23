import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../../components/ui/Button'
import { TelegramLoginButton } from '../../components/TelegramLoginButton'
import { haptics } from '../../lib/haptics'
import { auth, ApiError } from '../../lib/api'
import { useAppStore } from '../../store/appStore'

const hasTelegramLogin = !!import.meta.env.VITE_TELEGRAM_BOT_USERNAME

const slides = [
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path d="M4 17l3-9h10l3 9M4 17v3M20 17v3M7 12h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7.5" cy="17.5" r="1.5" fill="currentColor" />
        <circle cx="16.5" cy="17.5" r="1.5" fill="currentColor" />
      </svg>
    ),
    title: 'Корпоративный водитель',
    subtitle: 'Заказывайте поездки с водителем компании за 3–4 нажатия — с телефона или прямо в Telegram.',
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    title: 'Только свободные слоты',
    subtitle: 'Мы сразу покажем время в пути и подходящие окна в графике водителей.',
  },
  {
    icon: (
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
        <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="3" y="4" width="18" height="16" rx="4" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    title: 'Доступ по верификации',
    subtitle: 'Сервис только для сотрудников компании — подтверждение занимает пару минут.',
  },
]

const ERROR_MESSAGES: Record<string, string> = {
  TELEGRAM_AUTH_INVALID: 'Не удалось подтвердить вход через Telegram. Попробуйте ещё раз.',
  ACCOUNT_BLOCKED: 'Доступ к аккаунту заблокирован.',
}

function errorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? 'Что-то пошло не так. Попробуйте ещё раз.'
}

type Stage = 'login' | 'profile' | 'pending' | 'blocked'

function computeStage(
  user: ReturnType<typeof useAppStore.getState>['user'],
  isAuthenticated: boolean,
): Stage {
  if (!isAuthenticated || !user) return 'login'
  if (!user.full_name || !user.phone) return 'profile'
  if (user.status === 'blocked') return 'blocked'
  return 'pending'
}

export function OnboardingScreen() {
  const user = useAppStore((s) => s.user)
  const accessToken = useAppStore((s) => s.accessToken)
  const setUser = useAppStore((s) => s.setUser)
  const isAuthenticated = !!accessToken && !!user

  const [showSlides, setShowSlides] = useState(!isAuthenticated)
  const [slideIndex, setSlideIndex] = useState(0)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('')
  const [profileError, setProfileError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const stage = computeStage(user, isAuthenticated)

  async function handleProfileSubmit() {
    setProfileError(null)
    setBusy(true)
    try {
      const fullName = `${lastName.trim()} ${firstName.trim()}`.trim()
      const updated = await auth.updateProfile(fullName, phone.trim())
      haptics.notification('success')
      setUser(updated)
    } catch (err) {
      haptics.notification('error')
      setProfileError(err instanceof ApiError ? errorMessage(err.code) : 'Что-то пошло не так.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckStatus() {
    setBusy(true)
    try {
      const fresh = await auth.me()
      setUser(fresh)
    } catch {
      // still pending / network hiccup — stay on this screen
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <AnimatePresence mode="wait">
        {showSlides && (
          <motion.div
            key="slides"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full flex-col justify-between px-6 py-10"
          >
            <div className="flex justify-end">
              <button
                onClick={() => setShowSlides(false)}
                className="text-[13px] font-medium text-[var(--tg-text-secondary)]"
              >
                Пропустить
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={slideIndex}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col items-center gap-5 text-center"
              >
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-secondary text-white shadow-[var(--shadow-soft)]">
                  {slides[slideIndex].icon}
                </div>
                <h2 className="text-[22px] font-semibold text-[var(--tg-text)]">{slides[slideIndex].title}</h2>
                <p className="max-w-[260px] text-[14px] leading-relaxed text-[var(--tg-text-secondary)]">
                  {slides[slideIndex].subtitle}
                </p>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col gap-5">
              <div className="flex justify-center gap-1.5">
                {slides.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${i === slideIndex ? 'w-6 bg-primary' : 'w-1.5 bg-[var(--tg-surface)]'}`}
                  />
                ))}
              </div>
              <Button
                full
                size="lg"
                onClick={() => {
                  if (slideIndex < slides.length - 1) {
                    setSlideIndex((i) => i + 1)
                  } else {
                    setShowSlides(false)
                  }
                }}
              >
                {slideIndex < slides.length - 1 ? 'Далее' : 'Начать'}
              </Button>
            </div>
          </motion.div>
        )}

        {!showSlides && stage === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex h-full flex-col justify-center gap-4 px-6 py-10"
          >
            <h2 className="text-center text-[20px] font-semibold text-[var(--tg-text)]">Вход в ApexRide</h2>

            {hasTelegramLogin ? (
              <>
                <p className="mb-2 text-center text-[13px] text-[var(--tg-text-secondary)]">
                  Войдите через Telegram, чтобы продолжить.
                </p>
                <TelegramLoginButton onError={(code) => setLoginError(errorMessage(code))} />
                {loginError && (
                  <p className="text-center text-[13px] text-danger">{loginError}</p>
                )}
              </>
            ) : (
              <p className="text-center text-[13px] text-danger">
                Вход временно недоступен — обратитесь к администратору сервиса.
              </p>
            )}

            <button
              onClick={() => setShowSlides(true)}
              className="mt-2 self-center text-[13px] font-medium text-[var(--tg-text-secondary)]"
            >
              Назад
            </button>
          </motion.div>
        )}

        {!showSlides && stage === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex h-full flex-col px-6 py-10"
          >
            <h2 className="text-[20px] font-semibold text-[var(--tg-text)]">Заполните профиль</h2>
            <p className="mt-1 text-[13px] text-[var(--tg-text-secondary)]">
              Понадобится администратору для подтверждения доступа и водителю для связи с вами.
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Фамилия"
                className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
              />
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Имя"
                className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
              />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Номер телефона"
                type="tel"
                className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
              />

              {profileError && <p className="text-[13px] text-danger">{profileError}</p>}

              <Button
                full
                size="lg"
                className="mt-2"
                disabled={!lastName.trim() || !firstName.trim() || !phone.trim() || busy}
                onClick={handleProfileSubmit}
              >
                Продолжить
              </Button>
            </div>
          </motion.div>
        )}

        {!showSlides && stage === 'pending' && (
          <motion.div
            key="pending"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2.4, ease: 'easeInOut' }}
              className="flex h-24 w-24 items-center justify-center rounded-full bg-warning/10 text-warning"
            >
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.div>
            <h2 className="text-[19px] font-semibold text-[var(--tg-text)]">Заявка на рассмотрении</h2>
            <p className="max-w-[260px] text-[14px] text-[var(--tg-text-secondary)]">
              Администратор проверит данные и подтвердит доступ. Мы уведомим вас, как только это произойдёт.
            </p>
            <Button size="lg" className="mt-4" onClick={handleCheckStatus} disabled={busy}>
              Проверить статус
            </Button>
          </motion.div>
        )}

        {!showSlides && stage === 'blocked' && (
          <motion.div
            key="blocked"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
          >
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-danger/10 text-danger">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
                <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-[19px] font-semibold text-[var(--tg-text)]">Доступ заблокирован</h2>
            <p className="max-w-[260px] text-[14px] text-[var(--tg-text-secondary)]">
              Обратитесь к администратору сервиса за подробностями.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
