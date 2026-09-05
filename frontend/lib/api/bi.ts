import { requestJson } from './client'
import type { KpiResponse } from './types'

export const biApi = {
  getKpis: () => requestJson<KpiResponse>('/kpi'),
}
