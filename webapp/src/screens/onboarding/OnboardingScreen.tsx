import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '../../components/ui/Button'
import { haptics } from '../../lib/haptics'
import { useAppStore } from '../../store/appStore'

type Stage = 'slides' | 'contact' | 'code' | 'pending'

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
    subtitle: 'Заказывайте поездки с водителем компании за 3–4 нажатия, прямо в Telegram.',
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

export function OnboardingScreen() {
  const [stage, setStage] = useState<Stage>('slides')
  const [slideIndex, setSlideIndex] = useState(0)
  const [channel, setChannel] = useState<'email' | 'phone'>('email')
  const [contact, setContact] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const setShowOnboarding = useAppStore((s) => s.setShowOnboarding)

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
                onClick={() => setStage('contact')}
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
                    setStage('contact')
                  }
                }}
              >
                {slideIndex < slides.length - 1 ? 'Далее' : 'Начать'}
              </Button>
            </div>
          </motion.div>
        )}

        {stage === 'contact' && (
          <motion.div
            key="contact"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            className="flex h-full flex-col px-6 py-10"
          >
            <h2 className="text-[20px] font-semibold text-[var(--tg-text)]">Привяжите аккаунт</h2>
            <p className="mt-1 text-[13px] text-[var(--tg-text-secondary)]">
              Укажите корпоративную почту или поделитесь номером телефона.
            </p>

            <div className="mt-6 flex rounded-2xl bg-[var(--tg-surface)] p-1">
              {(['email', 'phone'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`flex-1 rounded-xl py-2 text-[13px] font-medium transition-colors ${
                    channel === c ? 'bg-[var(--tg-bg)] text-primary shadow-sm' : 'text-[var(--tg-text-secondary)]'
                  }`}
                >
                  {c === 'email' ? 'Почта' : 'Телефон'}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {channel === 'email' ? (
                <>
                  <input
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    placeholder="you@company.ru"
                    className="h-12 w-full rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-4 text-[15px] text-[var(--tg-text)] outline-none focus:border-primary"
                  />
                  <Button full size="lg" className="mt-4" disabled={!contact} onClick={() => setStage('code')}>
                    Получить код
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--tg-border)] p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M6.6 10.8a15.1 15.1 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11 11 0 003.5.56 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11 11 0 00.56 3.5 1 1 0 01-.25 1z" fill="currentColor" />
                      </svg>
                    </div>
                    <p className="text-[13px] text-[var(--tg-text-secondary)]">
                      Номер придёт напрямую от Telegram — вводить вручную не нужно.
                    </p>
                  </div>
                  <Button
                    full
                    size="lg"
                    className="mt-4"
                    onClick={() => {
                      haptics.notification('success')
                      setStage('pending')
                    }}
                  >
                    Поделиться контактом
                  </Button>
                </>
              )}
            </div>

            <button
              onClick={() => setStage('slides')}
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
              Отправили 6-значный код на {contact || 'вашу почту'}. Код действует 10 минут.
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

            <p className="mt-4 text-center text-[13px] text-[var(--tg-text-secondary)]">
              Не пришёл код? <span className="font-medium text-primary">Отправить снова (0:58)</span>
            </p>

            <Button
              full
              size="lg"
              className="mt-8"
              disabled={code.some((d) => !d)}
              onClick={() => {
                haptics.notification('success')
                setStage('pending')
              }}
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
            <h2 className="text-[19px] font-semibold text-[var(--tg-text)]">Заявка отправлена</h2>
            <p className="max-w-[260px] text-[14px] text-[var(--tg-text-secondary)]">
              Администратор проверит данные и подтвердит доступ. Обычно это занимает несколько минут — мы пришлём
              уведомление в этот чат.
            </p>
            <Button size="lg" className="mt-4" onClick={() => setShowOnboarding(false)}>
              Готово (демо: перейти в приложение)
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
