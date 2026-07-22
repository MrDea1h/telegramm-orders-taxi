import type { ReactNode } from 'react'

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-0 sm:p-6">
      <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[var(--tg-bg)] sm:h-[844px] sm:max-h-[92vh] sm:w-[390px] sm:rounded-[44px] sm:border-[8px] sm:border-black sm:shadow-2xl dark:sm:border-neutral-800">
        <div className="pointer-events-none absolute left-1/2 top-0 z-30 hidden h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-black sm:block dark:bg-neutral-800" />
        <div className="flex h-full flex-col overflow-hidden">{children}</div>
      </div>
    </div>
  )
}
