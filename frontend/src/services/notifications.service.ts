import { api } from './auth.service';

export interface AppNotification {
  id: number;
  userId: number;
  companyId: number;
  title: string;
  message: string;
  link: string | null;
  leida: boolean;
  createdAt: string;
}

export const getNotifications = (): Promise<AppNotification[]> =>
  api.get('/notifications').then((r) => r.data);

export const getUnreadNotificationsCount = (): Promise<{ count: number }> =>
  api.get('/notifications/unread-count').then((r) => r.data);

export const markNotificationRead = (id: number): Promise<AppNotification> =>
  api.patch(`/notifications/${id}/read`).then((r) => r.data);

export const markAllNotificationsRead = (): Promise<{ ok: true }> =>
  api.patch('/notifications/read-all').then((r) => r.data);
