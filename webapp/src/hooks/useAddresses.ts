import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addresses } from '../lib/api'

export function useFavoriteAddresses() {
  return useQuery({ queryKey: ['addresses', 'favorites'], queryFn: addresses.listFavorites })
}

export function useRecentAddresses() {
  return useQuery({ queryKey: ['addresses', 'recent'], queryFn: addresses.listRecent })
}

export function useTouchAddress() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ addressText, lat, lon }: { addressText: string; lat?: number; lon?: number }) =>
      addresses.touch(addressText, lat, lon),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses', 'recent'] })
    },
  })
}
