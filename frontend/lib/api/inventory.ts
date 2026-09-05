import { requestJson, withQuery } from './client'
import type {
  SparePartResponse,
  CreateSparePartRequest,
  PartUsageResponse,
  UsePartRequest,
} from './types'

export const inventoryApi = {
  list: (params?: {
    category?: string
    q?: string
    lowStockOnly?: boolean
  }) =>
    requestJson<SparePartResponse[]>(withQuery('/inventory', params)),

  create: (data: CreateSparePartRequest) =>
    requestJson<SparePartResponse>('/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStock: (id: number, quantity: number) =>
    requestJson<SparePartResponse>(`/inventory/${id}/stock?quantity=${quantity}`, {
      method: 'PATCH',
    }),

  addStock: (id: number, amount: number, actorId: number, actorName: string) =>
    requestJson<void>(withQuery(`/inventory/${id}/add-stock`, { amount, actorId, actorName }), {
      method: 'POST'
    }),

  usePart: (data: UsePartRequest) =>
    requestJson<PartUsageResponse>('/inventory/usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getUsages: (woId: number) =>
    requestJson<PartUsageResponse[]>(`/inventory/usage/work-order/${woId}`),

  requestRestock: (partId: number, quantity: number, userId: number) =>
    requestJson<any>(withQuery('/inventory/restock/request', { partId, quantity, userId }), {
      method: 'POST'
    }),

  getPendingRestocks: () => 
    requestJson<any[]>('/inventory/restock/pending'),

  approveRestock: (id: number, reviewerId: number, actualQuantity?: number) =>
    requestJson<void>(withQuery(`/inventory/restock/${id}/approve`, { reviewerId, actualQuantity }), {
      method: 'POST'
    }),

  rejectRestock: (id: number, reviewerId: number) =>
    requestJson<void>(withQuery(`/inventory/restock/${id}/reject`, { reviewerId }), {
      method: 'POST'
    }),

  getValuation: () =>
    requestJson<number>('/inventory/restock/valuation'),
}
