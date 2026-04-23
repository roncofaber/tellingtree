import { apiClient } from "./client";

export interface Notification {
  id: string;
  tree_id: string;
  type: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string | null;
  message: string;
  read_at: string | null;
  created_at: string;
}

export function listNotifications(unread = false, limit = 30) {
  return apiClient.get<Notification[]>("/notifications", {
    unread: String(unread),
    limit: String(limit),
  });
}

export function getUnreadCount() {
  return apiClient.get<{ count: number }>("/notifications/count");
}

export function markRead(id: string) {
  return apiClient.post<void>(`/notifications/${id}/read`);
}

export function markAllRead() {
  return apiClient.post<void>("/notifications/read-all");
}
