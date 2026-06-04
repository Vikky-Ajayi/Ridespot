import { api } from "@/services/api";
import { mapHotspot, unwrapData, type BackendDemandByHour, type BackendHotspot } from "./shared";

export const hotspotRepository = {
  async getHotspots(lat: number, lng: number, radius = 15000) {
    const response = await api.get("/api/hotspots", {
      params: { lat, lng, radius, limit: 10 }
    });

    const data = unwrapData<{ hotspots: BackendHotspot[]; total: number; generatedAt: string }>(
      response
    );

    return {
      hotspots: data.hotspots.map(mapHotspot),
      total: data.total,
      generatedAt: data.generatedAt
    };
  },

  async getHotspotById(id: string) {
    const response = await api.get(`/api/hotspots/${id}`);
    return mapHotspot(unwrapData<BackendHotspot>(response));
  },

  async getDemandByHour(id: string) {
    const response = await api.get(`/api/hotspots/${id}/demand-by-hour`);
    return unwrapData<BackendDemandByHour>(response);
  },

  async navigate(id: string) {
    const response = await api.post(`/api/hotspots/${id}/navigate`);
    return response.data;
  }
};
