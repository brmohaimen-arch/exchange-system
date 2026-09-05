import { requestBlob, requestJson, withQuery } from './client'
import type {
  ClaimListItemResponse,
  ClaimPhotoResponse,
  ClaimResponse,
  ClaimStatsResponse,
  CreateClaimRequest,
  UpdateClaimRequest,
  ClaimQualificationRequest,
  ClaimAssignRequest,
  ClaimStatusUpdateRequest,
} from './types'

export const claimsApi = {
  list: (params?: {
    status?: string
    priority?: string
    departmentId?: number
    equipmentId?: number
    assignedToUserId?: number
    q?: string
  }) =>
    requestJson<
      | ClaimListItemResponse[]
      | {
          value: ClaimListItemResponse[]
        }
    >(withQuery('/claims', params)).then((data) => {
      if (Array.isArray(data)) return data
      return Array.isArray(data.value) ? data.value : []
    }),

  getById: (id: number) => requestJson<ClaimResponse>(`/claims/${id}`),

  getStats: () => requestJson<ClaimStatsResponse>('/claims/stats'),

  create: (data: CreateClaimRequest) =>
    requestJson<ClaimResponse>('/claims', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id: number, data: UpdateClaimRequest) =>
    requestJson<ClaimResponse>(`/claims/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  qualify: (id: number, data: ClaimQualificationRequest) =>
    requestJson<ClaimResponse>(`/claims/${id}/qualify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  assign: (id: number, data: ClaimAssignRequest) =>
    requestJson<ClaimResponse>(`/claims/${id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, data: ClaimStatusUpdateRequest) =>
    requestJson<ClaimResponse>(`/claims/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getHistory: (id: number) =>
    requestJson<any[]>(`/claims/${id}/history`),

  uploadPhoto: async (claimId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestJson<ClaimPhotoResponse>(`/claims/${claimId}/photos`, {
      method: 'POST',
      body: formData,
    })
  },

  listPhotos: (claimId: number) => requestJson<ClaimPhotoResponse[]>(`/claims/${claimId}/photos`),

  deletePhoto: (claimId: number, photoId: number) =>
    requestJson<void>(`/claims/${claimId}/photos/${photoId}`, {
      method: 'DELETE',
    }),

  getPhotoBlob: (claimId: number, photoId: number) =>
    requestBlob(`/claims/${claimId}/photos/${photoId}/file`),

  convertToWorkOrder: (claimId: number) =>
    requestJson<any>(`/claims/${claimId}/convert-to-wo`, {
      method: 'POST',
    }),
}
