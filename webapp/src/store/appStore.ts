import { create } from 'zustand'
import type { Role } from '../data/types'

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
}))
