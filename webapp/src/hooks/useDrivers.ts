import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { drivers } from '../lib/api'

export function useDrivers() {
  return useQuery({ queryKey: ['drivers'], queryFn: drivers.list })
}

export function useMyDriverProfile() {
  return useQuery({ queryKey: ['drivers', 'me'], queryFn: drivers.me })
}

export function useSetDuty() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (onDuty: boolean) => drivers.setDuty(onDuty),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] })
    },
  })
}

export function useMySchedule() {
  return useQuery({ queryKey: ['drivers', 'me', 'schedule'], queryFn: drivers.mySchedule })
}

export function useSetMySchedule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (windows: { weekday: number; start_time: string; end_time: string }[]) =>
      drivers.setMySchedule(windows),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', 'me', 'schedule'] })
    },
  })
}
