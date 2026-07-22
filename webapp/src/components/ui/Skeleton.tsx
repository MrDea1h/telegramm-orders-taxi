import clsx from 'clsx'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'animate-pulse rounded-xl bg-[var(--tg-surface)]',
        className,
      )}
    />
  )
}
