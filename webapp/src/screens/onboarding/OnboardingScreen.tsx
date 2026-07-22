import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../../components/ui/Button'
import { TelegramLoginButton } from '../../components/TelegramLoginButton'
import { haptics } from '../../lib/haptics'
import { auth, ApiError } from '../../lib/api'
import { useAppStore } from '../../store/appStore'

type Stage = 'slides' | 'authChoice' | 'emailForm' | 'code' | 'pending' | 'blocked'
type FormMode = 'register' | 'login'

// Mirrors TelegramLoginButton's own gating — no bot username configured
// yet means that button renders nothing, so the surrounding "choose
// between two options" chrome (divider, subtitle copy) has to adapt too,
// rather than presenting a broken-looking single-option choice screen.
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
  EMAIL_TAKEN: 'Этот email уже зарегистрирован и подтверждён — попробуйте войти.',
  INVALID_CREDENTIALS: 'Неверный email или пароль.',
  ACCOUNT_BLOCKED: 'Доступ к аккаунту заблокирован.',
  EMAIL_NOT_CONFIRMED: 'Сначала подтвердите почту кодом из письма.',
  CODE_INVALID: 'Неверный код.',
  CODE_EXPIRED: 'Код истёк — запросите новый.',
  CODE_TOO_MANY_ATTEMPTS: 'Слишком много попыток — запросите новый код.',
  CODE_RATE_LIMITED: 'Слишком много запросов кода — попробуйте через час.',
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return ERROR_MESSAGES[err.code] ?? err.message
  return 'Что-то пошло не так. Попробуйте ещё раз.'
}

export function OnboardingScreen() {
  const [stage, setStage] = useState<Stage>('slides')
  const [slideIndex, setSlideIndex] = useState(0)
  const [mode, setMode] = useState<FormMode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding)
  const setAuth = useAppStore((s) => s.setAuth)

  function routeByStatus(status: string) {
    if (status === 'verified') {
      setShowOnboarding(false)
    } else if (status === 'blocked') {
      setStage('blocked')
    } else {
      setStage('pending')
    }
  }

  async function handleEmailFormSubmit() {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'register') {
        await auth.register(email, password, fullName)
        haptics.notification('success')
        setStage('code')
      } else {
        const result = await auth.login(email, password)
        haptics.notification('success')
        setAuth({ access_token: result.access_token, refresh_token: result.refresh_token }, result.user)
        routeByStatus(result.user.status)
      }
    } catch (err) {
      haptics.notification('error')
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCodeSubmit() {
    setError(null)
    setBusy(true)
    try {
      const result = await auth.verifyEmail(email, code.join(''))
      haptics.notification('success')
      setAuth({ access_token: result.access_token, refresh_token: result.refresh_token }, result.user)
      routeByStatus(result.user.status)
    } catch (err) {
      haptics.notification('error')
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleCheckStatus() {
    setBusy(true)
    try {
      const user = await auth.me()
      routeByStatus(user.status)
    } catch {
      // still pending / network hiccup — stay on this screen
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <AnimatePresence mode="wait">
        {stage === 'slides' && (
          <motion.div
            key="slides"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex h-full flex-col justify-between px-6 py-10"
          >
            <div className="flex justify-end">
              <button
                onClick={() => setStage('authChoice')}
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
                    setStage('authChoice')
                  }
                }}
              >
                {slideIndex < slides.length - 1 ? 'Далее' : 'Начать'}
              </Button>
            </div>
          </motion.div>
        )}

        {stage === 'authChoice' && (
          <motion.div
            key="authChoice"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex h-full flex-col justify-center gap-4 px-6 py-10"
          >
            <h2 className="text-center text-[20px] font-semibold text-[var(--tg-text)]">Вход в ApexRide</h2>
            <p className="mb-2 text-center text-[13px] text-[var(--tg-text-secondary)]">
              {hasTelegramLogin
                ? 'Выберите способ входа — оба ведут в один и тот же аккаунт.'
                : 'Войдите с рабочей почтой, чтобы продолжить.'}
            </p>

            {hasTelegramLogin && (
              <>
                <TelegramLoginButton />
                <div className="flex items-center gap-3 text-[12px] text-[var(--tg-text-secondary)]">
                  <div className="h-px flex-1 bg-[var(--tg-border)]" />
                  или
                  <div className="h-px flex-1 bg-[var(--tg-border)]" />
                </div>
              </>
            )}

            <Button
              full
              size="lg"
              variant={hasTelegramLogin ? 'secondary' : 'primary'}
              onClick={() => {
                setMode('register')
                setStage('emailForm')
              }}
            >
              Продолжить с email
            </Button>

            <button
              onClick={() => setStage('slides')}
              className="mt-2 self-center text-[13px] font-medium text-[var(--tg-text-secondary)]"
            >
              Назад
            </button>
          </motion.div>
        )}

        {stage === 'emailForm' && (
          <motion.div
            key="emailForm"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex h-full flex-col px-6 py-10"
          >
            <h2 className="text-[20px] font-semibold text-[var(--tg-text)]">
              {mode === 'register' ? 'Регистрация' : 'Вход'}
            </h2>

            <div className="mt-6 flex rounded-2xl bg-[var(--tg-surface)] p-1">
              {(['register', 'login'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m)
                    setError(null)
                  }}
                  className={`flex-1 rounded-xl py-2 text-[13px] font-medium transition-colors ${
                    mode === m ? 'bg-[var(--tg-bg)] text-primary shadow-sm' : 'text-[var(--tg-text-secondary)]'
                  }`}
                >
                  {m === 'register' ? 'Регистрация' : 'Вход'}
                </button>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {mode === 'register' && (
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Имя и фамилия"
                  className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
                />
              )}
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.ru"
                type="email"
                className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Пароль"
                type="password"
                className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
              />

              {error && <p className="text-[13px] text-danger">{error}</p>}

              <Button
                full
                size="lg"
                className="mt-2"
                disabled={!email || !password || (mode === 'register' && !fullName) || busy}
                onClick={handleEmailFormSubmit}
              >
                {mode === 'register' ? 'Зарегистрироваться' : 'Войти'}
              </Button>
            </div>

            <button
              onClick={() => setStage('authChoice')}
              className="mt-auto self-center text-[13px] font-medium text-[var(--tg-text-secondary)]"
            >
              Назад
            </button>
          </motion.div>
        )}

        {stage === 'code' && (
          <motion.div
            key="code"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex h-full flex-col px-6 py-10"
          >
            <h2 className="text-[20px] font-semibold text-[var(--tg-text)]">Введите код</h2>
            <p className="mt-1 text-[13px] text-[var(--tg-text-secondary)]">
              Отправили 6-значный код на {email}. Код действует 10 минут.
            </p>

            <div className="mt-8 flex justify-between gap-2">
              {code.map((d, i) => (
                <input
                  key={i}
                  value={d}
                  maxLength={1}
                  inputMode="numeric"
                  onChange={(e) => {
                    const next = [...code]
                    next[i] = e.target.value.replace(/\D/g, '')
                    setCode(next)
                    haptics.selection()
                  }}
                  className="h-14 w-11 rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] text-center text-[20px] font-semibold text-[var(--tg-text)] outline-none focus:border-primary"
                />
              ))}
            </div>

            {error && <p className="mt-4 text-center text-[13px] text-danger">{error}</p>}

            <Button
              full
              size="lg"
              className="mt-8"
              disabled={code.some((d) => !d) || busy}
              onClick={handleCodeSubmit}
            >
              Подтвердить
            </Button>
          </motion.div>
        )}

        {stage === 'pending' && (
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

        {stage === 'blocked' && (
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
