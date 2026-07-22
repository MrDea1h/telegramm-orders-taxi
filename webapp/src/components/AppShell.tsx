import type { ReactNode } from 'react'

/**
 * Production wrapper — no dev-toolbar, no fake phone bezel/notch (that's
 * PhoneFrame, kept for local `npm run dev` design review only). Screens
 * were designed at phone width, so this still caps width on a wide
 * desktop viewport, just without pretending to be a physical device.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen justify-center bg-[var(--tg-surface)]">
      <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--tg-bg)] sm:max-w-[480px] sm:shadow-xl">
        {children}
      </div>
    </div>
  )
}
