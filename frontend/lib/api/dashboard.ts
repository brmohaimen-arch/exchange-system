import { requestJson } from './client'

export interface DashboardStats {
  // Top 4 KPI cards
  totalEquipment: number
  activeWorkOrders: number
  pendingClaims: number
  criticalAlerts: number
  // Secondary KPIs
  mtbfHours: number
  mttrHours: number
  availabilityRate: number
  // Maintenance distribution %
  preventivePct: number
  correctivePct: number
  regulatoryPct: number
  predictivePct: number
  // Financial / inventory
  lowStockParts: number
  pendingRestocks: number
  machinesDown: number
  monthlySpend: number
  reliabilityScore: number
}

export interface ActivityItem {
  id: string
  type: 'WO_STATUS' | 'CLAIM_NEW' | 'RESTOCK_APPROVED' | string
  title: string
  description: string
  actor: string
  timestamp: string
  referenceId: string
}

export const dashboardApi = {
  getStats: () => requestJson<DashboardStats>('/dashboard/stats'),
  getActivity: () => requestJson<ActivityItem[]>('/dashboard/activity'),
}
