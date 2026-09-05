const DEFAULT_API_BASE_URL = '/api'
const AUTH_TOKEN_STORAGE_KEY = 'cmms.auth.token'

export class ApiError extends Error {
  status: number
  payload: unknown

  constructor(message: string, status: number, payload: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export function getApiBaseUrl() {
  const envBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  const raw = (envBaseUrl && envBaseUrl.trim().length > 0 ? envBaseUrl : DEFAULT_API_BASE_URL).trim()
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
}

export function clearAuthToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
}

async function safeParseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

function shouldRedirectToLogin() {
  if (typeof window === 'undefined') return false
  const path = window.location?.pathname ?? ''
  return !path.startsWith('/login')
}

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')

  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    clearAuthToken()
    if (shouldRedirectToLogin()) window.location.href = '/login'
    throw new ApiError('Unauthorized', 401, await safeParseJson(response))
  }

  if (!response.ok) {
    const payload = await safeParseJson(response)
    const errorMessage = (payload as any)?.message || (payload as any)?.error || 'Request failed'
    throw new ApiError(`${errorMessage} (${response.status})`, response.status, payload)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  const trimmed = text.trim()
  if (!trimmed) return undefined as T
  
  try {
    return JSON.parse(trimmed) as T
  } catch (e) {
    console.error(`Failed to parse JSON from ${url}:`, e, "Body:", text)
    // If it's not valid JSON, but we expected T, return null or throw a cleaner error
    return null as unknown as T
  }
}

export async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const baseUrl = getApiBaseUrl()
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

  const headers = new Headers(init.headers)
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, {
    ...init,
    headers,
  })

  if (response.status === 401) {
    clearAuthToken()
    if (shouldRedirectToLogin()) window.location.href = '/login'
    throw new ApiError('Unauthorized', 401, null)
  }

  if (!response.ok) {
    throw new ApiError('Request failed', response.status, null)
  }

  return await response.blob()
}

export function withQuery(path: string, query?: Record<string, string | number | boolean | null | undefined>) {
  if (!query) return path
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const qs = params.toString()
  return qs.length > 0 ? `${path}?${qs}` : path
}
