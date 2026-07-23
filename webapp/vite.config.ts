import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is done manually in main.tsx (via the virtual:pwa-register
      // module) so a new deploy can force an immediate reload instead of
      // silently sitting in the background — during active development a
      // returning visitor would otherwise keep seeing a stale cached build
      // until they happened to reload twice or clear site data.
      injectRegister: null,
      // Web Push subscription wiring lands in M4 once the backend endpoint
      // exists — this only makes the app installable/offline-capable.
      manifest: {
        name: 'ApexRide',
        short_name: 'ApexRide',
        description: 'Заказ корпоративного водителя',
        theme_color: '#7C3AED',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
})
