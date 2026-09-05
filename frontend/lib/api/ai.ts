import { requestJson, withQuery } from './client'
import type { 
  PredictionResponse,
  PriorityDashboardResponse,
  PrioritySuggestionResponse,
  AcceptPrioritySuggestionRequest,
  OverridePrioritySuggestionRequest,
  RejectPrioritySuggestionRequest,
  ClaimPriority,
  SlaStatus,
  PriorityDecisionStatus
} from './types'

export interface PrioritySuggestionFilters {
  priority?: ClaimPriority
  slaStatus?: SlaStatus
  decisionStatus?: PriorityDecisionStatus
  search?: string
  departmentId?: number | string
}

export const aiApi = {
  getPredictions: () => requestJson<PredictionResponse[]>('/ai/predictions'),
  
  getPriorityDashboard: () => 
    requestJson<PriorityDashboardResponse>('/ai/prioritization/dashboard'),
    
  getPrioritySuggestions: (filters?: PrioritySuggestionFilters) => 
    requestJson<PrioritySuggestionResponse[]>(withQuery('/ai/prioritization/suggestions', filters as any)),
    
  calculateClaimPriority: (claimId: number) => 
    requestJson<PrioritySuggestionResponse>(`/ai/prioritization/claims/${claimId}/calculate`, {
      method: 'POST'
    }),
    
  getSuggestionByClaimId: (claimId: number) =>
    requestJson<PrioritySuggestionResponse>(`/ai/prioritization/claims/${claimId}/suggestion`),
    
  acceptPrioritySuggestion: (id: number, body?: AcceptPrioritySuggestionRequest) => 
    requestJson<PrioritySuggestionResponse>(`/ai/prioritization/suggestions/${id}/accept`, {
      method: 'POST',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    }),
    
  overridePrioritySuggestion: (id: number, body: OverridePrioritySuggestionRequest) => 
    requestJson<PrioritySuggestionResponse>(`/ai/prioritization/suggestions/${id}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    
  rejectPrioritySuggestion: (id: number, body: RejectPrioritySuggestionRequest) => 
    requestJson<PrioritySuggestionResponse>(`/ai/prioritization/suggestions/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }),
    
  getFailureAnalysisReports: (params?: import('./types').FailureAnalysisParams) => 
    requestJson<import('./types').FailureAnalysisReportSummary[]>(withQuery('/ai/failure-analysis/reports', params as any)),
    
  getFailureAnalysisReportDetail: (reportId: string, params?: import('./types').FailureAnalysisParams) => 
    requestJson<import('./types').FailureAnalysisReportDetail>(withQuery(`/ai/failure-analysis/reports/${encodeURIComponent(reportId)}`, params as any)),
}
