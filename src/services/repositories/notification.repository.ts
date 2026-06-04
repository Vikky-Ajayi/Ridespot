import { api } from "@/services/api";

export const notificationRepository = {
  async registerPushToken(payload: { token: string }) {
    await api.post("/api/driver/notifications/fcm-token", payload);
  }
};
