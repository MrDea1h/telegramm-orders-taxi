import { type ComponentType, type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ThemeProvider } from './lib/theme'
import { useAppStore } from './store/appStore'
import { useAuthBootstrap } from './hooks/useAuthBootstrap'
import { AppShell } from './components/AppShell'
import { OnboardingScreen } from './screens/onboarding/OnboardingScreen'
import { HomeScreen } from './screens/user/HomeScreen'
import { OrderWizardScreen } from './screens/user/OrderWizardScreen'
import { OrderDetailScreen } from './screens/user/OrderDetailScreen'
import { DriverTodayScreen } from './screens/driver/DriverTodayScreen'
import { AdminScreen } from './screens/admin/AdminScreen'

function Screens() {
  const { role, userScreen, showOnboarding, authReady, accessToken, user } = useAppStore()
  const isAuthenticated = !!accessToken && !!user

  // showOnboarding (the dev-toolbar manual toggle) always wins, for quick
  // design review without going through a real login. Otherwise gate on
  // the real auth state established by useAuthBootstrap.
  if (showOnboarding || (authReady && !isAuthenticated)) {
    return <OnboardingScreen />
  }

  if (!authReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  const key = role === 'user' ? userScreen : role

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={key}
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="h-full"
      >
        {role === 'driver' && <DriverTodayScreen />}
        {role === 'admin' && <AdminScreen />}
        {role === 'user' && userScreen === 'home' && <HomeScreen />}
        {role === 'user' && userScreen === 'wizard' && <OrderWizardScreen />}
        {role === 'user' && userScreen === 'orderDetail' && <OrderDetailScreen />}
      </motion.div>
    </AnimatePresence>
  )
}

// Dev-only chrome (role/theme switcher, phone-mockup bezel for desktop
// design review) is dynamically imported so it never ends up in the
// production bundle at all, not just unrendered — real users should never
// see a "demo panel" or a fake phone border.
function DevChrome({ children }: { children: ReactNode }) {
  const [Comps, setComps] = useState<{
    DevToolbar: ComponentType
    PhoneFrame: ComponentType<{ children: ReactNode }>
  } | null>(null)

  useEffect(() => {
    Promise.all([import('./components/DevToolbar'), import('./components/PhoneFrame')]).then(
      ([toolbar, frame]) => setComps({ DevToolbar: toolbar.DevToolbar, PhoneFrame: frame.PhoneFrame }),
    )
  }, [])

  if (!Comps) return null
  const { DevToolbar, PhoneFrame } = Comps
  return (
    <>
      <DevToolbar />
      <div className="pt-12">
        <PhoneFrame>{children}</PhoneFrame>
      </div>
    </>
  )
}

function App() {
  useAuthBootstrap()

  return (
    <ThemeProvider>
      {import.meta.env.DEV ? (
        <DevChrome>
          <Screens />
        </DevChrome>
      ) : (
        <AppShell>
          <Screens />
        </AppShell>
      )}
    </ThemeProvider>
  )
}

export default App
