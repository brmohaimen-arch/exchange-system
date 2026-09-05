import { requestJson } from './client'
import type { LoginRequest, LoginResponse, UserResponse } from './types'

export const authApi = {
  login: (data: LoginRequest) => requestJson<LoginResponse>('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),

  me: () => requestJson<UserResponse>('/auth/me'),
}
