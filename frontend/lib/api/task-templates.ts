import { requestJson } from "./client"
import { TaskTemplateResponse, CreateTaskTemplateRequest } from "./types"

export const taskTemplatesApi = {
  getAll: async (): Promise<TaskTemplateResponse[]> => {
    return requestJson<TaskTemplateResponse[]>("/task-templates")
  },

  getById: async (id: number): Promise<TaskTemplateResponse> => {
    return requestJson<TaskTemplateResponse>(`/task-templates/${id}`)
  },

  create: async (data: CreateTaskTemplateRequest): Promise<TaskTemplateResponse> => {
    return requestJson<TaskTemplateResponse>("/task-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  },

  update: async (id: number, data: CreateTaskTemplateRequest): Promise<TaskTemplateResponse> => {
    return requestJson<TaskTemplateResponse>(`/task-templates/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    })
  },

  delete: async (id: number): Promise<void> => {
    return requestJson<void>(`/task-templates/${id}`, {
      method: "DELETE",
    })
  }
}
