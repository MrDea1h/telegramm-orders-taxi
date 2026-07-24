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

function useInvalidateAddresses() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ['addresses'] })
}

export function useCreateFavoriteAddress() {
  const invalidate = useInvalidateAddresses()
  return useMutation({
    mutationFn: (input: { label: string; addressText: string }) =>
      addresses.create({ label: input.label, address_text: input.addressText, is_favorite: true }),
    onSuccess: invalidate,
  })
}

export function useDeleteAddress() {
  const invalidate = useInvalidateAddresses()
  return useMutation({
    mutationFn: (id: string) => addresses.remove(id),
    onSuccess: invalidate,
  })
}
