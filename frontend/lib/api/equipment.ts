import { requestBlob, requestJson, withQuery } from './client'
import type {
  EquipmentHistory,
  EquipmentRequest,
  EquipmentResponse,
  EquipmentDocument,
} from './types'

export const equipmentApi = {
  getAll: () => requestJson<EquipmentResponse[]>('/equipment'),

  search: (params: { departmentId?: number; status?: string; q?: string }) =>
    requestJson<EquipmentResponse[]>(withQuery('/equipment/search', params)),

  getById: (id: number) => requestJson<EquipmentResponse>(`/equipment/${id}`),

  create: (data: EquipmentRequest) =>
    requestJson<EquipmentResponse>('/equipment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id: number, data: EquipmentRequest) =>
    requestJson<EquipmentResponse>(`/equipment/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStatus: (id: number, status: string) =>
    requestJson<EquipmentResponse>(withQuery(`/equipment/${id}/status`, { status }), {
      method: 'PATCH',
    }),

  archive: (id: number) =>
    requestJson<EquipmentResponse>(`/equipment/${id}/archive`, {
      method: 'PATCH',
    }),

  getHistory: (id: number) => requestJson<EquipmentHistory[]>(`/equipment/${id}/history`),

  uploadDocument: async (equipmentId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestJson<EquipmentDocument>(`/equipment/${equipmentId}/documents`, {
      method: 'POST',
      body: formData,
    })
  },

  getDocuments: (equipmentId: number) => requestJson<EquipmentDocument[]>(`/equipment/${equipmentId}/documents`),

  deleteDocument: (documentId: number) =>
    requestJson<void>(`/equipment/documents/${documentId}`, {
      method: 'DELETE',
    }),

  downloadDocument: (documentId: number) => requestBlob(`/equipment/documents/${documentId}/download`),
}
