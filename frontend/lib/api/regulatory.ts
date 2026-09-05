import { requestJson } from "./client"
import type { WorkOrderResponse } from "./types"

export interface RegulatoryPlanResponse {
  planId: number
  planCode: string
  title: string
  description: string
  equipmentId: number
  equipmentName: string
  departmentName: string
  priority: string
  recurrenceUnit: string
  recurrenceValue: number
  startDate: string
  nextDueDate: string
  lastExecutionDate: string | null
  reminderDays: number
  gracePeriod: number
  isMandatory: boolean
  isActive: boolean
  complianceReference: string
  requiresDocument: boolean
  documentType: string
  assignedTechnicianId: number | null
  assignedTechnicianName: string
  estimatedDuration: number
  checklistTemplate: string // JSON
  postponementReason: string | null
  status: string
  createdAt: string
  updatedAt: string
}

export interface WoChecklist {
  checklistId: number
  woId: number
  itemsJson: string
  completedAt: string | null
  updatedAt: string
}

export const regulatoryApi = {
  list: () => requestJson<RegulatoryPlanResponse[]>("/regulatory-plans"),
  getById: (id: number) => requestJson<RegulatoryPlanResponse>(`/regulatory-plans/${id}`),
  create: (data: any) => requestJson<RegulatoryPlanResponse>("/regulatory-plans", {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
  }),
  update: (id: number, data: any) => requestJson<RegulatoryPlanResponse>(`/regulatory-plans/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
  }),
  
  getChecklist: (woId: number) => requestJson<WoChecklist>(`/work-orders/${woId}/checklist`),
  updateChecklist: (woId: number, itemsJson: string) => requestJson<WoChecklist>(`/work-orders/${woId}/checklist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: itemsJson, 
  }),
  generateWorkOrder: (id: number) => requestJson<void>(`/regulatory-plans/${id}/generate-wo`, {
      method: 'POST',
  }),
}
