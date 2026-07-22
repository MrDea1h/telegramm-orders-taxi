import type { OrderStatus } from './types'

export interface StatusMeta {
  label: string
  color: string
  bg: string
}

export const statusMeta: Record<OrderStatus, StatusMeta> = {
  draft: { label: 'Черновик', color: '#6b6376', bg: '#f2f1f5' },
  pending_driver: { label: 'Ищем водителя', color: '#f59e0b', bg: '#fef3c7' },
  confirmed: { label: 'Подтверждено', color: '#3b82f6', bg: '#dbeafe' },
  driver_en_route: { label: 'Водитель в пути', color: '#7c3aed', bg: '#ede9fe' },
  driver_arrived: { label: 'Водитель на месте', color: '#7c3aed', bg: '#ede9fe' },
  in_progress: { label: 'В поездке', color: '#3b82f6', bg: '#dbeafe' },
  completed: { label: 'Завершено', color: '#10b981', bg: '#d1fae5' },
  cancelled_by_user: { label: 'Отменено вами', color: '#ef4444', bg: '#fee2e2' },
  cancelled_by_driver: { label: 'Отменено водителем', color: '#ef4444', bg: '#fee2e2' },
  cancelled_by_admin: { label: 'Отменено админом', color: '#ef4444', bg: '#fee2e2' },
  expired: { label: 'Не принято', color: '#ef4444', bg: '#fee2e2' },
}

export const orderSteps: { key: OrderStatus; label: string }[] = [
  { key: 'pending_driver', label: 'Заказ создан' },
  { key: 'confirmed', label: 'Принят' },
  { key: 'driver_en_route', label: 'В пути' },
  { key: 'in_progress', label: 'Поездка' },
  { key: 'completed', label: 'Завершено' },
]
