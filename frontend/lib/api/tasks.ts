import { requestJson, withQuery } from './client'
import type { TaskResponse, TaskPhotoResponse } from './types'

export const tasksApi = {
  getAll: (params?: { status?: string; woId?: number }) =>
    requestJson<TaskResponse[]>(withQuery('/tasks', params)),

  getById: (taskId: number) =>
    requestJson<TaskResponse>(`/tasks/${taskId}`),

  getByWorkOrder: (woId: number) =>
    requestJson<TaskResponse[]>(`/tasks/work-order/${woId}`),

  create: (data: Partial<TaskResponse>) =>
    requestJson<TaskResponse>('/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (taskId: number, data: any) =>
    requestJson<TaskResponse>(`/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStatus: (taskId: number, status: string, reason?: string) =>
    requestJson<TaskResponse>(withQuery(`/tasks/${taskId}/status`, { status, reason }), {
      method: 'PATCH',
    }),

  complete: (taskId: number) =>
    requestJson<TaskResponse>(`/tasks/${taskId}/complete`, {
      method: 'PATCH',
    }),

  approve: (taskId: number, status: 'APPROVED' | 'REJECTED') =>
    requestJson<TaskResponse>(withQuery(`/tasks/${taskId}/approval`, { status }), {
      method: 'PATCH',
    }),

  replanRequest: (taskId: number, reason: string) =>
    requestJson<TaskResponse>(withQuery(`/tasks/${taskId}/replan-request`, { reason }), {
      method: 'PATCH',
    }),

  approveReplan: (taskId: number, status: 'APPROVED' | 'REJECTED') =>
    requestJson<TaskResponse>(withQuery(`/tasks/${taskId}/replan-approval`, { status }), {
      method: 'PATCH',
    }),

  replan: (taskId: number, reason?: string) =>
    requestJson<TaskResponse>(withQuery(`/tasks/${taskId}/replan`, { reason }), {
      method: 'PATCH',
    }),

  delete: (taskId: number) =>
    requestJson<void>(`/tasks/${taskId}`, {
      method: 'DELETE',
    }),

  toggleSubTask: (subTaskId: number, completed: boolean) =>
    requestJson<void>(withQuery(`/tasks/sub-tasks/${subTaskId}`, { completed }), {
      method: 'PATCH',
    }),
    
  uploadPhoto: async (taskId: number, file: File, type: 'BEFORE' | 'AFTER'): Promise<TaskPhotoResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    return requestJson<TaskPhotoResponse>(withQuery(`/tasks/${taskId}/photos`, { type }), {
      method: 'POST',
      body: formData,
    })
  },

  deletePhoto: (taskId: number, photoId: number) =>
    requestJson<void>(`/tasks/${taskId}/photos/${photoId}`, {
      method: 'DELETE',
    }),

  getPhotoUrl: (taskId: number, photoId: number) => {
    // Use relative path — routes through Next.js proxy → backend-service in Kubernetes
    return `/api/tasks/${taskId}/photos/${photoId}/download`
  }
}
