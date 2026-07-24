import { useState } from 'react'
import { motion } from 'framer-motion'
import { TopBar } from '../../components/ui/TopBar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { useFavoriteAddresses, useCreateFavoriteAddress, useDeleteAddress } from '../../hooks/useAddresses'
import { useAppStore } from '../../store/appStore'
import { haptics } from '../../lib/haptics'

const QUICK_TAGS = ['Дом', 'Работа']

function PinIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 21s7-6.1 7-11.2A7 7 0 0 0 5 9.8C5 14.9 12 21 12 21Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

export function AddressesScreen() {
  const goTo = useAppStore((s) => s.goTo)
  const { data: favorites, isLoading } = useFavoriteAddresses()
  const createFavorite = useCreateFavoriteAddress()
  const deleteAddress = useDeleteAddress()

  const [isAdding, setIsAdding] = useState(false)
  const [tag, setTag] = useState<string>(QUICK_TAGS[0])
  const [customTag, setCustomTag] = useState('')
  const [addressText, setAddressText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const usingCustomTag = tag === 'custom'
  const effectiveLabel = usingCustomTag ? customTag.trim() : tag

  function resetForm() {
    setIsAdding(false)
    setTag(QUICK_TAGS[0])
    setCustomTag('')
    setAddressText('')
    setError(null)
  }

  async function handleAdd() {
    if (!addressText.trim() || !effectiveLabel) return
    setError(null)
    try {
      await createFavorite.mutateAsync({ label: effectiveLabel, addressText: addressText.trim() })
      haptics.notification('success')
      resetForm()
    } catch {
      haptics.notification('error')
      setError('Не удалось сохранить адрес. Попробуйте ещё раз.')
    }
  }

  async function handleDelete(id: string) {
    haptics.impact('medium')
    await deleteAddress.mutateAsync(id)
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tg-bg)]">
      <TopBar title="Мои адреса" onBack={() => goTo('home')} />

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : favorites?.length ? (
          <div className="flex flex-col gap-2">
            {favorites.map((a, i) => (
              <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="flex items-center gap-3 p-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 21s7-6.1 7-11.2A7 7 0 0 0 5 9.8C5 14.9 12 21 12 21Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="9.5" r="2" stroke="currentColor" strokeWidth="1.8" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[var(--tg-text)]">{a.label ?? 'Адрес'}</p>
                    <p className="truncate text-[12px] text-[var(--tg-text-secondary)]">{a.address_text}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(a.id)}
                    disabled={deleteAddress.isPending}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--tg-text-secondary)] active:bg-black/5 dark:active:bg-white/5"
                    aria-label="Удалить адрес"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                </Card>
              </motion.div>
            ))}
          </div>
        ) : (
          !isAdding && (
            <EmptyState
              icon={<PinIcon />}
              title="Пока нет избранных адресов"
              subtitle="Сохраните дом, работу или другое частое место"
            />
          )
        )}

        {isAdding ? (
          <Card className="mt-3 flex flex-col gap-3 p-4">
            <div>
              <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Тег</p>
              <div className="flex flex-wrap gap-2">
                {QUICK_TAGS.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      haptics.selection()
                      setTag(t)
                    }}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                      tag === t ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--tg-border)] text-[var(--tg-text)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  onClick={() => {
                    haptics.selection()
                    setTag('custom')
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${
                    usingCustomTag ? 'border-primary bg-primary/5 text-primary' : 'border-[var(--tg-border)] text-[var(--tg-text)]'
                  }`}
                >
                  Свой тег
                </button>
              </div>
              {usingCustomTag && (
                <input
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder="Например, «Дача»"
                  maxLength={100}
                  className="mt-2 h-11 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 text-[var(--tg-text)] outline-none focus:border-primary"
                />
              )}
            </div>

            <div>
              <p className="mb-2 text-[12px] font-medium text-[var(--tg-text-secondary)]">Адрес</p>
              <input
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                placeholder="Введите адрес"
                className="h-11 w-full rounded-xl border border-[var(--tg-border)] bg-[var(--tg-bg)] px-3 text-[var(--tg-text)] outline-none focus:border-primary"
              />
            </div>

            {error && <p className="text-[13px] text-danger">{error}</p>}

            <div className="flex gap-2">
              <Button variant="secondary" full onClick={resetForm}>
                Отмена
              </Button>
              <Button
                full
                disabled={!addressText.trim() || !effectiveLabel || createFavorite.isPending}
                onClick={handleAdd}
              >
                {createFavorite.isPending ? 'Сохраняем…' : 'Сохранить'}
              </Button>
            </div>
          </Card>
        ) : (
          <Button variant="secondary" full className="mt-3" onClick={() => setIsAdding(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            Добавить адрес
          </Button>
        )}
      </div>
    </div>
  )
}
