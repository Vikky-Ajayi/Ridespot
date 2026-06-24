import { api } from "@/services/api";
import type { Hotspot, HotspotSearchMetadata } from "@/types";
import {
  deduplicateById,
  mapHotspot,
  mapHotspotSearchMetadata,
  unwrapData,
  type BackendHotspot,
  type BackendHotspotSearchResponse
} from "./shared";

interface BackendNearbyEventsResponse extends BackendHotspotSearchResponse {
  events?: BackendHotspot[];
}

export interface NearbyEventsResult {
  events: Hotspot[];
  total: number;
  generatedAt: string;
  metadata: HotspotSearchMetadata;
}

export const eventRepository = {
  async getNearbyEvents(
    lat: number,
    lng: number,
    radius = 15000,
    days = 3,
    limit = 50
  ): Promise<NearbyEventsResult> {
    const response = await api.get("/api/events/nearby", {
      params: { lat, lng, radius, days, limit }
    });
    const data = unwrapData<BackendNearbyEventsResponse>(response);
    const rows = deduplicateById(data.events ?? data.hotspots ?? []);

    return {
      events: rows.map(mapHotspot),
      total: data.total ?? rows.length,
      generatedAt: data.generatedAt ?? new Date().toISOString(),
      metadata: mapHotspotSearchMetadata({
        ...data,
        hotspots: rows
      })
    };
  }
};
