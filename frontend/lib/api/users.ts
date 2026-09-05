import { requestJson, withQuery } from './client'
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserResponse,
  UserStatusRequest,
} from './types'

export const usersApi = {
  getAll: () => requestJson<UserResponse[]>('/users'),

  search: (params: { roleId?: number; departmentId?: number; q?: string }) =>
    requestJson<UserResponse[]>(withQuery('/users/search', params)),

  getById: (id: number) => requestJson<UserResponse>(`/users/${id}`),

  create: (data: CreateUserRequest) =>
    requestJson<UserResponse>('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateUserRequest) =>
    requestJson<UserResponse>(`/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, isActive: boolean) =>
    requestJson<UserResponse>(`/users/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive } satisfies UserStatusRequest),
    }),

  delete: (id: number) =>
    requestJson<void>(`/users/${id}`, {
      method: 'DELETE',
    }),
}
