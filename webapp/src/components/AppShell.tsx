import type { ReactNode } from 'react'

/**
 * Production wrapper — no dev-toolbar, no fake phone bezel/notch (that's
 * PhoneFrame, kept for local `npm run dev` design review only). Screens
 * were designed at phone width, so this still caps width on a wide
 * desktop viewport, just without pretending to be a physical device.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    // dvh, not vh: in installed-PWA/standalone mode, 100vh doesn't track
    // the actual visible viewport (notably on iOS), so a bottom-pinned CTA
    // via justify-between can end up below the fold, requiring a scroll to
    // reach it. 100dvh tracks the real visible area.
    <div className="flex min-h-dvh justify-center bg-[var(--tg-surface)]">
      <div className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--tg-bg)] sm:max-w-[480px] sm:shadow-xl">
        {children}
      </div>
    </div>
  )
}
