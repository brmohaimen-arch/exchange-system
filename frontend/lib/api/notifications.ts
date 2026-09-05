import { requestJson, withQuery } from './client'
import type { NotificationResponse } from './types'

export const notificationsApi = {
  getUnread: (userId: number) => 
    requestJson<NotificationResponse[]>(withQuery('/notifications', { userId })),

  getAll: (userId: number, page = 0, size = 10) => 
    requestJson<{ content: NotificationResponse[], totalElements: number }>(
      withQuery('/notifications/all', { userId, page, size })
    ),

  markAsRead: (id: number) => 
    requestJson<NotificationResponse>(`/notifications/${id}/read`, {
      method: 'PATCH'
    }),

  markAllAsRead: (userId: number) => 
    requestJson<void>(withQuery('/notifications/mark-all-read', { userId }), {
      method: 'POST'
    }),

  getCount: (userId: number) => 
    requestJson<number>(withQuery('/notifications/count', { userId }))
}
