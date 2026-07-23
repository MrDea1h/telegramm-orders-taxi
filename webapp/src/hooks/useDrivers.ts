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
