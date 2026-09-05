import { requestJson, withQuery } from './client'
import type {
  WorkOrderResponse,
  CreateWorkOrderRequest,
  AssignWorkOrderRequest,
  TaskResponse,
} from './types'

export const workOrdersApi = {
  list: (params?: {
    status?: string
    type?: string
    equipmentId?: number
    assignedToUserId?: number
  }) =>
    requestJson<WorkOrderResponse[]>(withQuery('/work-orders', params)),

  getById: (id: number) => requestJson<WorkOrderResponse>(`/work-orders/${id}`),

  create: (data: CreateWorkOrderRequest) =>
    requestJson<WorkOrderResponse>('/work-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id: number, data: any) =>
    requestJson<WorkOrderResponse>(`/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  assign: (id: number, data: AssignWorkOrderRequest) =>
    requestJson<WorkOrderResponse>(`/work-orders/${id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, data: { status: string; note?: string; forceClose?: boolean }) =>
    requestJson<WorkOrderResponse>(`/work-orders/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  validate: (id: number, data: { validationNotes: string }) =>
    requestJson<WorkOrderResponse>(`/work-orders/${id}/validate`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  close: (id: number) =>
    requestJson<WorkOrderResponse>(`/work-orders/${id}/close`, {
      method: 'PATCH',
    }),

  reschedule: (id: number, data: { plannedStart?: string | null; plannedEnd?: string | null; dueDate?: string | null; estimatedDuration?: number | null }) =>
    requestJson<WorkOrderResponse>(`/work-orders/${id}/reschedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getHistory: (id: number) =>
    requestJson<any[]>(`/work-orders/${id}/history`),

  getDelayed: () =>
    requestJson<WorkOrderResponse[]>(`/work-orders/delayed`),

  getCalendar: () =>
    requestJson<WorkOrderResponse[]>(`/work-orders/calendar`),

  getWorkload: () =>
    requestJson<any[]>(`/work-orders/workload`),

  getRecommendations: (woId: number) =>
    requestJson<import('./types').TechnicianRecommendationDTO[]>(`/work-orders/${woId}/recommend-technicians`),

  toggleFollower: (id: number) =>
    requestJson<void>(`/work-orders/${id}/toggle-follower`, {
      method: 'PATCH',
    }),

  isFollowing: (id: number) =>
    requestJson<boolean>(`/work-orders/${id}/is-following`),

  getFollowers: (id: number) =>
    requestJson<any[]>(`/work-orders/${id}/followers`),

  getTasks: (woId: number) => requestJson<TaskResponse[]>(`/tasks/work-order/${woId}`),

  completeTask: (taskId: number) =>
    requestJson<TaskResponse>(`/tasks/${taskId}/complete`, {
      method: 'PATCH',
    }),

  getLabor: (woId: number) =>
    requestJson<any[]>(`/maintenance/work-orders/${woId}/labor`),

  logLabor: (woId: number, params: { userId: number; durationMinutes: number; hourlyRate: number; notes?: string }) =>
    requestJson<any>(withQuery(`/maintenance/work-orders/${woId}/labor`, params), {
      method: 'POST',
    }),
}
