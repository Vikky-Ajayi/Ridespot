import { api } from "@/services/api";
import {
  deduplicateById,
  mapHotspot,
  mapHotspotSearchMetadata,
  unwrapData,
  type BackendDemandByHour,
  type BackendHotspot,
  type BackendHotspotSearchResponse
} from "./shared";

export const hotspotRepository = {
  async getHotspots(lat: number, lng: number, radius = 15000) {
    const response = await api.get("/api/hotspots", {
      params: { lat, lng, radius, limit: 10 }
    });

    const data = unwrapData<BackendHotspotSearchResponse>(response);

    const rows = data.hotspots ?? [];

    return {
      hotspots: deduplicateById(rows.map(mapHotspot)),
      total: data.total,
      generatedAt: data.generatedAt,
      metadata: mapHotspotSearchMetadata(data)
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
