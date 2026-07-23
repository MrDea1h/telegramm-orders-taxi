import { useAppStore } from '../store/appStore'

export const REFRESH_TOKEN_STORAGE_KEY = 'apexride_refresh_token'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export interface MeResponse {
  id: string
  email: string | null
  telegram_id: number | null
  role: 'user' | 'driver' | 'admin'
  status: 'pending' | 'verified' | 'blocked'
  full_name: string | null
  phone: string | null
  can_order: boolean
  email_confirmed_at: string | null
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
  register: (email: string, password: string, full_name: string) =>
    apiFetch<{ status: string }>('/v1/auth/register', {
      method: 'POST',
      body: { email, password, full_name },
    }),

  verifyEmail: (email: string, code: string) =>
    apiFetch<AuthResponse>('/v1/auth/verify-email', {
      method: 'POST',
      body: { email, code },
    }),

  login: (email: string, password: string) =>
    apiFetch<AuthResponse>('/v1/auth/login', { method: 'POST', body: { email, password } }),

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
}

export interface VerificationRequest {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  telegram_id: number | null
  email_confirmed_at: string | null
  created_at: string
}

export interface AdminUser {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  telegram_id: number | null
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
