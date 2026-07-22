export type Role = 'user' | 'driver' | 'admin'

export type OrderStatus =
  | 'draft'
  | 'pending_driver'
  | 'confirmed'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled_by_user'
  | 'cancelled_by_driver'
  | 'cancelled_by_admin'
  | 'expired'

export interface Address {
  id: string
  label: string
  addressText: string
  isFavorite?: boolean
}

export interface Car {
  model: string
  plate: string
  color: string
}

export interface Driver {
  id: string
  fullName: string
  avatarColor: string
  car: Car
  isActive: boolean
  rating: number
}

export interface Order {
  id: string
  status: OrderStatus
  from: Address
  to: Address
  scheduledAt: string // ISO
  etaMin: number
  distanceKm: number
  passengers: number
  comment?: string
  driverId?: string
  createdByName: string
}

export interface VerificationRequest {
  id: string
  fullName: string
  email?: string
  phone?: string
  tgUsername: string
  requestedAt: string
}

export interface AppUser {
  id: string
  fullName: string
  role: Role
  status: 'pending' | 'verified' | 'blocked'
  canOrder: boolean
  tripsCount: number
}
