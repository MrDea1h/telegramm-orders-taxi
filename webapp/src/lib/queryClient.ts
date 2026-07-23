import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Order/schedule data changes from other actors (driver actions, admin
      // reassignment) with no push channel yet (that's M4) — a short stale
      // time keeps screens reasonably fresh without refetching on every render.
      staleTime: 15_000,
      retry: 1,
    },
  },
})
