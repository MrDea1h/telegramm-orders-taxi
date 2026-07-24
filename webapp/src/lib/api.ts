import type { OrderStatus } from '../data/types'
import { useAppStore } from '../store/appStore'

export const REFRESH_TOKEN_STORAGE_KEY = 'apexride_refresh_token'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface MeResponse {
  id: string
  telegram_id: number
  role: 'user' | 'driver' | 'admin'
  status: 'pending' | 'verified' | 'blocked'
  full_name: string | null
  phone: string | null
  can_order: boolean
}

export interface TokenPair {
  access_token: string
  refresh_token: string
}

export interface AuthResponse extends TokenPair {
  user: MeResponse
}

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function parseErrorBody(response: Response): Promise<{ code: string; message: string }> {
  try {
    const body = await response.json()
    if (body?.error?.code) return body.error
  } catch {
    // fall through to generic error below
  }
  return { code: 'UNKNOWN', message: `Request failed with ${response.status}` }
}

interface FetchOptions {
  method?: string
  body?: unknown
  auth?: boolean
  // Internal: prevents infinite refresh loops when the refresh call itself 401s.
  _isRetry?: boolean
}

async function apiFetch<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, _isRetry = false } = opts
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (auth) {
    const token = useAppStore.getState().accessToken
    if (token) headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (response.status === 401 && auth && !_isRetry) {
    const refreshed = await tryRefresh()
    if (refreshed) return apiFetch<T>(path, { ...opts, _isRetry: true })
    useAppStore.getState().clearAuth()
    const err = await parseErrorBody(response)
    throw new ApiError(response.status, err.code, err.message)
  }

  if (!response.ok) {
    const err = await parseErrorBody(response)
    throw new ApiError(response.status, err.code, err.message)
  }

  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
  if (!refreshToken) return false

  try {
    const response = await fetch(`${BASE_URL}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!response.ok) return false

    const tokens = (await response.json()) as TokenPair
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refresh_token)
    // Only the access token is updated here — `user` is refreshed
    // separately by whichever caller needs it (bootstrap calls `me()`
    // right after), avoiding a stale-user flash on every silent refresh.
    useAppStore.setState({ accessToken: tokens.access_token })
    return true
  } catch {
    return false
  }
}

export const auth = {
  refresh: () => tryRefresh(),

  logout: async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)
    if (refreshToken) {
      await apiFetch('/v1/auth/logout', { method: 'POST', body: { refresh_token: refreshToken } })
    }
    useAppStore.getState().clearAuth()
  },

  telegramLoginWidget: (payload: Record<string, unknown>) =>
    apiFetch<AuthResponse>('/v1/auth/telegram/login-widget', { method: 'POST', body: payload }),

  telegramInitData: (initData: string) =>
    apiFetch<AuthResponse>('/v1/auth/telegram/init-data', {
      method: 'POST',
      body: { init_data: initData },
    }),

  me: () => apiFetch<MeResponse>('/v1/auth/me', { auth: true }),

  updateProfile: (fullName: string, phone: string) =>
    apiFetch<MeResponse>('/v1/auth/profile', {
      method: 'PATCH',
      auth: true,
      body: { full_name: fullName, phone },
    }),
}

export interface VerificationRequest {
  id: string
  full_name: string | null
  phone: string | null
  telegram_id: number
  created_at: string
}

export interface AdminUser {
  id: string
  full_name: string | null
  phone: string | null
  telegram_id: number
  role: 'user' | 'driver' | 'admin'
  status: 'pending' | 'verified' | 'blocked'
  created_at: string
}

export const admin = {
  listVerificationRequests: () =>
    apiFetch<VerificationRequest[]>('/v1/admin/verification-requests', { auth: true }),

  approveVerificationRequest: (userId: string) =>
    apiFetch<{ id: string; status: string }>(`/v1/admin/verification-requests/${userId}/approve`, {
      method: 'POST',
      auth: true,
    }),

  rejectVerificationRequest: (userId: string, reason: string) =>
    apiFetch<{ id: string; status: string }>(`/v1/admin/verification-requests/${userId}/reject`, {
      method: 'POST',
      auth: true,
      body: { reason },
    }),

  listUsers: () => apiFetch<AdminUser[]>('/v1/admin/users', { auth: true }),

  setUserRole: (userId: string, role: 'user' | 'driver' | 'admin') =>
    apiFetch<AdminUser>(`/v1/admin/users/${userId}/role`, {
      method: 'PATCH',
      auth: true,
      body: { role },
    }),
}

export interface Address {
  id: string
  label: string | null
  address_text: string
  lat: number | null
  lon: number | null
  is_favorite: boolean
  last_used_at: string | null
}

export const addresses = {
  listFavorites: () => apiFetch<Address[]>('/v1/addresses?scope=favorites', { auth: true }),

  listRecent: () => apiFetch<Address[]>('/v1/addresses?scope=recent', { auth: true }),

  create: (input: {
    label?: string
    address_text: string
    lat?: number
    lon?: number
    is_favorite?: boolean
  }) => apiFetch<Address>('/v1/addresses', { method: 'POST', auth: true, body: input }),

  setFavorite: (id: string, isFavorite: boolean) =>
    apiFetch<Address>(`/v1/addresses/${id}/favorite`, {
      method: 'PATCH',
      auth: true,
      body: { is_favorite: isFavorite },
    }),

  remove: (id: string) => apiFetch<void>(`/v1/addresses/${id}`, { method: 'DELETE', auth: true }),

  touch: (addressText: string, lat?: number, lon?: number) =>
    apiFetch<Address>('/v1/addresses/touch', {
      method: 'POST',
      auth: true,
      body: { address_text: addressText, lat, lon },
    }),
}

export interface DriverProfile {
  id: string
  full_name: string | null
  car_model: string | null
  car_plate: string | null
  car_color: string | null
  is_active: boolean
  on_duty: boolean
}

export interface ScheduleWindow {
  id?: string
  weekday: number
  start_time: string
  end_time: string
}

export interface TimeOff {
  id: string
  starts_at: string
  ends_at: string
  reason: string | null
}

export const drivers = {
  list: () => apiFetch<DriverProfile[]>('/v1/drivers', { auth: true }),

  me: () => apiFetch<DriverProfile>('/v1/drivers/me', { auth: true }),

  mySchedule: () => apiFetch<ScheduleWindow[]>('/v1/drivers/me/schedule', { auth: true }),

  setMySchedule: (windows: { weekday: number; start_time: string; end_time: string }[]) =>
    apiFetch<ScheduleWindow[]>('/v1/drivers/me/schedule', {
      method: 'PUT',
      auth: true,
      body: windows,
    }),

  addTimeOff: (startsAt: string, endsAt: string, reason?: string) =>
    apiFetch<TimeOff>('/v1/drivers/me/time-off', {
      method: 'POST',
      auth: true,
      body: { starts_at: startsAt, ends_at: endsAt, reason },
    }),

  removeTimeOff: (id: string) =>
    apiFetch<void>(`/v1/drivers/me/time-off/${id}`, { method: 'DELETE', auth: true }),

  setDuty: (onDuty: boolean) =>
    apiFetch<{ on_duty: boolean }>('/v1/drivers/me/duty', {
      method: 'PATCH',
      auth: true,
      body: { on_duty: onDuty },
    }),
}

export interface EtaResult {
  duration_min: number
  distance_km: number
  is_estimated: boolean
  source: 'real' | 'fallback'
}

export const routing = {
  eta: (input: {
    from_lat?: number
    from_lon?: number
    from_address?: string
    to_lat?: number
    to_lon?: number
    to_address?: string
  }) => apiFetch<EtaResult>('/v1/routing/eta', { method: 'POST', auth: true, body: input }),
}

export interface Order {
  id: string
  user_id: string
  driver_id: string | null
  status: OrderStatus
  from_address: string
  from_lat: number | null
  from_lon: number | null
  to_address: string
  to_lat: number | null
  to_lon: number | null
  scheduled_at: string
  est_duration_min: number
  est_distance_km: number | null
  passengers: number
  comment: string | null
  created_at: string
  updated_at: string
  cancel_reason: string | null
  cancelled_by: string | null
  proposed_scheduled_at: string | null
  is_round_trip: boolean
  wait_time_min: number | null
  driver_full_name: string | null
  driver_car_model: string | null
  driver_car_plate: string | null
  driver_car_color: string | null
}

export interface SlotOut {
  time: string
  available: boolean
}

export interface SlotsResult {
  slots: SlotOut[]
  booking_horizon_days: number
  min_lead_min: number
}

export type OrderTransitionAction =
  | 'accept'
  | 'reject'
  | 'propose_time'
  | 'depart'
  | 'arrive'
  | 'start'
  | 'complete'

export const orders = {
  slots: (
    date: string,
    driverId?: string,
    durationMin?: number,
    fromLat?: number,
    fromLon?: number,
    toLat?: number,
    toLon?: number,
    isRoundTrip?: boolean,
  ) => {
    const params = new URLSearchParams({ date })
    if (driverId) params.set('driver_id', driverId)
    if (durationMin) params.set('duration_min', String(durationMin))
    if (fromLat != null) params.set('from_lat', String(fromLat))
    if (fromLon != null) params.set('from_lon', String(fromLon))
    if (toLat != null) params.set('to_lat', String(toLat))
    if (toLon != null) params.set('to_lon', String(toLon))
    if (isRoundTrip) params.set('is_round_trip', 'true')
    return apiFetch<SlotsResult>(`/v1/orders/slots?${params.toString()}`, { auth: true })
  },

  notifyApproaching: (id: string) =>
    apiFetch<{ notified: boolean }>(`/v1/orders/${id}/notify-approaching`, {
      method: 'POST',
      auth: true,
    }),

  create: (input: {
    idempotency_key: string
    from_address: string
    from_lat?: number
    from_lon?: number
    to_address: string
    to_lat?: number
    to_lon?: number
    scheduled_at: string
    est_duration_min?: number
    est_distance_km?: number
    passengers?: number
    comment?: string
    driver_id?: string | null
    is_round_trip?: boolean
    wait_time_min?: number
  }) => apiFetch<Order>('/v1/orders', { method: 'POST', auth: true, body: input }),

  list: (scope: 'upcoming' | 'history') =>
    apiFetch<Order[]>(`/v1/orders?scope=${scope}`, { auth: true }),

  get: (id: string) => apiFetch<Order>(`/v1/orders/${id}`, { auth: true }),

  update: (id: string, input: { comment?: string; passengers?: number }) =>
    apiFetch<Order>(`/v1/orders/${id}`, { method: 'PATCH', auth: true, body: input }),

  cancel: (id: string, reason?: string) =>
    apiFetch<Order>(`/v1/orders/${id}/cancel`, { method: 'POST', auth: true, body: { reason } }),

  transition: (
    id: string,
    action: OrderTransitionAction,
    reason?: string,
    proposedScheduledAt?: string,
  ) =>
    apiFetch<Order>(`/v1/orders/${id}/transition`, {
      method: 'POST',
      auth: true,
      body: { action, reason, proposed_scheduled_at: proposedScheduledAt },
    }),

  respondToCounter: (id: string, accept: boolean) =>
    apiFetch<Order>(`/v1/orders/${id}/counter`, { method: 'POST', auth: true, body: { accept } }),

  queue: () => apiFetch<Order[]>('/v1/orders/queue', { auth: true }),
}

export interface AdminOrder extends Order {
  user_full_name: string | null
  user_phone: string | null
}

export const adminOrders = {
  list: (
    filters: { status?: string; driver_id?: string; date_from?: string; date_to?: string } = {},
  ) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value)
    }
    const qs = params.toString()
    return apiFetch<AdminOrder[]>(`/v1/admin/orders${qs ? `?${qs}` : ''}`, { auth: true })
  },

  assign: (id: string, driverId: string | null) =>
    apiFetch<AdminOrder>(`/v1/admin/orders/${id}/assign`, {
      method: 'PATCH',
      auth: true,
      body: { driver_id: driverId },
    }),

  cancel: (id: string, reason: string) =>
    apiFetch<AdminOrder>(`/v1/admin/orders/${id}/cancel`, {
      method: 'POST',
      auth: true,
      body: { reason },
    }),
}

export const push = {
  subscribe: (endpoint: string, keys: { p256dh: string; auth: string }, userAgent?: string) =>
    apiFetch<{ id: string }>('/v1/push/subscribe', {
      method: 'POST',
      auth: true,
      body: { endpoint, keys, user_agent: userAgent },
    }),

  unsubscribe: (endpoint: string) =>
    apiFetch<void>('/v1/push/subscribe', { method: 'DELETE', auth: true, body: { endpoint } }),
}
