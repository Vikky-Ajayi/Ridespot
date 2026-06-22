import { api } from "@/services/api";
import type { DriverLocation, NavigationSession } from "@/types";
import { unwrapData } from "./shared";

export const navigationRepository = {
  async startSession(hotspotId: string, origin: DriverLocation) {
    const response = await api.post("/api/navigation/sessions", {
      hotspotId,
      origin
    });

    return unwrapData<NavigationSession>(response);
  },

  async getActiveSession() {
    const response = await api.get("/api/navigation/sessions/active");
    return unwrapData<NavigationSession | null>(response);
  },

  async cancelSession(id: string) {
    const response = await api.patch(`/api/navigation/sessions/${id}/cancel`);
    return unwrapData<NavigationSession>(response);
  },

  async completeSession(id: string) {
    const response = await api.patch(`/api/navigation/sessions/${id}/complete`);
    return unwrapData<NavigationSession>(response);
  }
};
