import { AnimatePresence, motion } from 'framer-motion'
import { ThemeProvider } from './lib/theme'
import { useAppStore } from './store/appStore'
import { PhoneFrame } from './components/PhoneFrame'
import { DevToolbar } from './components/DevToolbar'
import { OnboardingScreen } from './screens/onboarding/OnboardingScreen'
import { HomeScreen } from './screens/user/HomeScreen'
import { OrderWizardScreen } from './screens/user/OrderWizardScreen'
import { OrderDetailScreen } from './screens/user/OrderDetailScreen'
import { DriverTodayScreen } from './screens/driver/DriverTodayScreen'
import { AdminScreen } from './screens/admin/AdminScreen'

function Screens() {
  const { role, userScreen, showOnboarding } = useAppStore()

  if (showOnboarding) {
    return <OnboardingScreen />
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

function App() {
  return (
    <ThemeProvider>
      <DevToolbar />
      <div className="pt-12">
        <PhoneFrame>
          <Screens />
        </PhoneFrame>
      </div>
    </ThemeProvider>
  )
}

export default App
