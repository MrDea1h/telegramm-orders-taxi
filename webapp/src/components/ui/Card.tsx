import type { HTMLAttributes } from 'react'
import clsx from 'clsx'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'rounded-[20px] bg-[var(--tg-bg)] border border-[var(--tg-border)] shadow-[var(--tg-shadow)]',
        className,
      )}
      {...rest}
    />
  )
}
