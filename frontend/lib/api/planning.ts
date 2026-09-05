import { requestJson } from './client'
import type { MaintenancePlanResponse } from './types'

export const planningApi = {
  getAll: () => requestJson<MaintenancePlanResponse[]>('/planning'),
  
  create: (data: Partial<MaintenancePlanResponse>) =>
    requestJson<MaintenancePlanResponse>('/planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  triggerGeneration: () =>
    requestJson<void>('/planning/generate-now', {
      method: 'POST',
    }),
}
