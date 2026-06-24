import { api } from "@/services/api";
import { mapProfile, unwrapData, type BackendProfile } from "./shared";

export const profileRepository = {
  async getProfile() {
    const response = await api.get("/api/driver/profile");
    return mapProfile(unwrapData<BackendProfile>(response));
  },

  async updateProfile(payload: {
    fullName?: string;
    phone?: string | null;
    country?: string;
  }) {
    const response = await api.put("/api/driver/profile", payload);
    return mapProfile(unwrapData<BackendProfile>(response));
  },

  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmNewPassword: string
  ) {
    const response = await api.put("/api/driver/password", {
      currentPassword,
      newPassword,
      confirmNewPassword
    });

    return response.data;
  },

  async getNotificationPreferences() {
    const response = await api.get("/api/driver/notifications/preferences");
    return unwrapData<BackendProfile["notificationPreferences"]>(response);
  },

  async updateNotificationPreferences(prefs: BackendProfile["notificationPreferences"]) {
    const response = await api.put("/api/driver/notifications/preferences", prefs);
    return unwrapData<BackendProfile["notificationPreferences"]>(response);
  }
};
