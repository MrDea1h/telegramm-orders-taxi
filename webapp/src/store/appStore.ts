import { create } from 'zustand'
import type { Role } from '../data/types'
import type { MeResponse, TokenPair } from '../lib/api'
import { REFRESH_TOKEN_STORAGE_KEY } from '../lib/api'

export type UserScreen = 'onboarding' | 'home' | 'wizard' | 'orderDetail'
export type DriverScreen = 'today' | 'schedule'
export type AdminScreen = 'admin'

interface AppState {
  role: Role
  // Admin accounts are treated as superusers with access to every workflow
  // (see the M3 follow-up decision) — this is purely a local UI toggle for
  // which screen set an admin currently sees; the real `role` never changes,
  // so backend authorization is untouched by it.
  adminViewAs: Role
  userScreen: UserScreen
  driverScreen: DriverScreen
  adminScreen: AdminScreen
  selectedOrderId: string | null
  showOnboarding: boolean
  setRole: (role: Role) => void
  setAdminViewAs: (view: Role) => void
  goTo: (screen: UserScreen) => void
  goToDriverScreen: (screen: DriverScreen) => void
  openOrder: (id: string) => void
  closeOrder: () => void
  setShowOnboarding: (v: boolean) => void

  // Auth — accessToken/user live in memory only (cleared on reload); the
  // refresh token additionally persists to localStorage so a reload can
  // silently re-establish a session instead of forcing re-login. See the
  // M2 plan for why this (not an httpOnly cookie) was chosen.
  accessToken: string | null
  user: MeResponse | null
  authReady: boolean
  setAuth: (tokens: TokenPair, user: MeResponse) => void
  setUser: (user: MeResponse) => void
  clearAuth: () => void
  setAuthReady: (v: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  role: 'user',
  adminViewAs: 'admin',
  userScreen: 'home',
  driverScreen: 'today',
  adminScreen: 'admin',
  selectedOrderId: null,
  showOnboarding: false,
  setRole: (role) => set({ role }),
  setAdminViewAs: (view) => set({ adminViewAs: view }),
  goTo: (screen) => set({ userScreen: screen }),
  goToDriverScreen: (screen) => set({ driverScreen: screen }),
  openOrder: (id) => set({ selectedOrderId: id, userScreen: 'orderDetail' }),
  closeOrder: () => set({ selectedOrderId: null, userScreen: 'home' }),
  setShowOnboarding: (v) => set({ showOnboarding: v }),

  accessToken: null,
  user: null,
  authReady: false,
  setAuth: (tokens, user) => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token)
    // `role` drives which screens render (see App.tsx) — in production it
    // always tracks the real authenticated user's role. DevToolbar (dev
    // build only) can still override it locally afterwards, purely for
    // previewing other roles' screens without needing separate accounts.
    set({
      accessToken: tokens.access_token,
      user,
      role: user.role,
      adminViewAs: 'admin',
      driverScreen: 'today',
      authReady: true,
    })
  },
  setUser: (user) => set({ user, role: user.role }),
  clearAuth: () => {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    set({ accessToken: null, user: null, adminViewAs: 'admin', driverScreen: 'today', authReady: true })
  },
  setAuthReady: (v) => set({ authReady: v }),
}))
