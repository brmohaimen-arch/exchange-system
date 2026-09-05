import { requestJson } from './client'
import type { CreateDepartmentRequest, DepartmentResponse } from './types'

export const departmentsApi = {
  getAll: () => requestJson<DepartmentResponse[]>('/departments'),

  create: (data: CreateDepartmentRequest) =>
    requestJson<DepartmentResponse>('/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    requestJson<void>(`/departments/${id}`, {
      method: 'DELETE',
    }),
}
