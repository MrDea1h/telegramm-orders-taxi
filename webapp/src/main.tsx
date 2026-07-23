import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { registerSW } from 'virtual:pwa-register'
import { queryClient } from './lib/queryClient'
import './index.css'
import App from './App.tsx'

// Force an immediate reload the moment a new build's service worker takes
// over, instead of the default silent background update — during active
// development a returning visitor would otherwise keep seeing a stale
// cached build until they happened to reload twice or clear site data.
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
