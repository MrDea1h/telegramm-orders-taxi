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
