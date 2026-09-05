import { requestJson } from './client'
import type { EquipmentCategory, EquipmentModel } from './types'

export const referenceDataApi = {
  getCategories: () => requestJson<EquipmentCategory[]>('/equipment-categories'),
  createCategory: (name: string) =>
    requestJson<EquipmentCategory>('/equipment-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteCategory: (id: number) =>
    requestJson<void>(`/equipment-categories/${id}`, {
      method: 'DELETE',
    }),

  getModels: () => requestJson<EquipmentModel[]>('/equipment-models'),
  createModel: (name: string) =>
    requestJson<EquipmentModel>('/equipment-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  deleteModel: (id: number) =>
    requestJson<void>(`/equipment-models/${id}`, {
      method: 'DELETE',
    }),
}
