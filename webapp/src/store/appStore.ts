import { create } from 'zustand'
import type { Role } from '../data/types'
import type { MeResponse, TokenPair } from '../lib/api'
import { REFRESH_TOKEN_STORAGE_KEY } from '../lib/api'

export type UserScreen = 'onboarding' | 'home' | 'wizard' | 'orderDetail'
export type DriverScreen = 'today'
export type AdminScreen = 'admin'

interface AppState {
  role: Role
  userScreen: UserScreen
  driverScreen: DriverScreen
  adminScreen: AdminScreen
  selectedOrderId: string | null
  showOnboarding: boolean
  setRole: (role: Role) => void
  goTo: (screen: UserScreen) => void
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
  userScreen: 'home',
  driverScreen: 'today',
  adminScreen: 'admin',
  selectedOrderId: null,
  showOnboarding: false,
  setRole: (role) => set({ role }),
  goTo: (screen) => set({ userScreen: screen }),
  openOrder: (id) => set({ selectedOrderId: id, userScreen: 'orderDetail' }),
  closeOrder: () => set({ selectedOrderId: null, userScreen: 'home' }),
  setShowOnboarding: (v) => set({ showOnboarding: v }),

  accessToken: null,
  user: null,
  authReady: false,
  setAuth: (tokens, user) => {
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token)
    set({ accessToken: tokens.access_token, user, authReady: true })
  },
  setUser: (user) => set({ user }),
  clearAuth: () => {
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY)
    set({ accessToken: null, user: null, authReady: true })
  },
  setAuthReady: (v) => set({ authReady: v }),
}))
