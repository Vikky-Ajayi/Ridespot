import { api } from "@/services/api";
import type { AppNotification } from "@/types";
import { unwrapData } from "./shared";

interface NotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

export const notificationRepository = {
  async registerPushToken(payload: { token: string }) {
    await api.post("/api/driver/notifications/fcm-token", payload);
  },

  async getNotifications(limit = 50) {
    const response = await api.get("/api/notifications", {
      params: { limit }
    });
    return unwrapData<NotificationListResponse>(response);
  },

  async getUnreadCount() {
    const response = await api.get("/api/notifications/unread-count");
    return unwrapData<{ unreadCount: number }>(response);
  },

  async markRead(id: string) {
    const response = await api.patch(`/api/notifications/${id}/read`);
    return unwrapData<AppNotification>(response);
  },

  async markAllRead() {
    const response = await api.patch("/api/notifications/read-all");
    return unwrapData<{ updated: number }>(response);
  },

  async sendTestNotification() {
    const response = await api.post("/api/notifications/test");
    return unwrapData<AppNotification>(response);
  }
};
