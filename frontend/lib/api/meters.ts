import { requestJson } from './client'
import type {
  MeterLog,
  MeterLogRequest,
  MeterLogResponse,
  MeterResponse,
  MeterThreshold,
} from './types'

export const metersApi = {
  getAll: () => requestJson<MeterResponse[]>('/meters'),

  getById: (id: number) => requestJson<MeterResponse>(`/meters/${id}`),

  recordLog: (id: number, data: MeterLogRequest) =>
    requestJson<MeterLogResponse>(`/meters/${id}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getLogs: (id: number) => requestJson<MeterLog[]>(`/meters/${id}/logs`),

  createThreshold: (id: number, data: { thresholdValue: number; label: string }) =>
    requestJson<MeterThreshold>(`/meters/${id}/thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getThresholds: (id: number) => requestJson<MeterThreshold[]>(`/meters/${id}/thresholds`),
  reset: (id: number) => requestJson<MeterResponse>(`/meters/${id}/reset`, { method: 'POST' }),
}
