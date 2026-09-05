import { requestJson } from './client'
import type { CreateRoleRequest, RoleResponse } from './types'

export const rolesApi = {
  getAll: () => requestJson<RoleResponse[]>('/roles'),

  create: (data: CreateRoleRequest) =>
    requestJson<RoleResponse>('/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    requestJson<void>(`/roles/${id}`, {
      method: 'DELETE',
    }),
}
