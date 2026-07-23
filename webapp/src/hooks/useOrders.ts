import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminOrders, orders, type OrderTransitionAction } from '../lib/api'

export function useUpcomingOrder() {
  return useQuery({ queryKey: ['orders', 'upcoming'], queryFn: () => orders.list('upcoming') })
}

export function useOrderHistory() {
  return useQuery({ queryKey: ['orders', 'history'], queryFn: () => orders.list('history') })
}

export function useOrderDetail(orderId: string | null) {
  return useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => orders.get(orderId!),
    enabled: !!orderId,
  })
}

export function useSlots(
  date: string | null,
  driverId: string | undefined,
  durationMin: number | undefined,
) {
  return useQuery({
    queryKey: ['orders', 'slots', date, driverId, durationMin],
    queryFn: () => orders.slots(date!, driverId, durationMin),
    enabled: !!date,
  })
}

// Polled — the M3 stand-in for M4's eventual push-driven refetch of the
// driver's queue.
export function useDriverQueue() {
  return useQuery({
    queryKey: ['orders', 'queue'],
    queryFn: orders.queue,
    refetchInterval: 20_000,
  })
}

function useInvalidateOrders() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['orders'] })
}

export function useCreateOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({ mutationFn: orders.create, onSuccess: invalidate })
}

export function useUpdateOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { comment?: string; passengers?: number } }) =>
      orders.update(id, input),
    onSuccess: invalidate,
  })
}

export function useCancelOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => orders.cancel(id, reason),
    onSuccess: invalidate,
  })
}

export function useTransitionOrder() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
      proposedScheduledAt,
    }: {
      id: string
      action: OrderTransitionAction
      reason?: string
      proposedScheduledAt?: string
    }) => orders.transition(id, action, reason, proposedScheduledAt),
    onSuccess: invalidate,
  })
}

export function useRespondToCounter() {
  const invalidate = useInvalidateOrders()
  return useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      orders.respondToCounter(id, accept),
    onSuccess: invalidate,
  })
}

export function useAdminOrders(filters: {
  status?: string
  driver_id?: string
  date_from?: string
  date_to?: string
}) {
  return useQuery({
    queryKey: ['admin', 'orders', filters],
    queryFn: () => adminOrders.list(filters),
  })
}

function useInvalidateAdminOrders() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
}

export function useAssignOrder() {
  const invalidate = useInvalidateAdminOrders()
  return useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string | null }) =>
      adminOrders.assign(id, driverId),
    onSuccess: invalidate,
  })
}

export function useAdminCancelOrder() {
  const invalidate = useInvalidateAdminOrders()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminOrders.cancel(id, reason),
    onSuccess: invalidate,
  })
}
