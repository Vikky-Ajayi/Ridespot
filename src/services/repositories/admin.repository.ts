import { adminApi } from "@/services/admin-api";
import type { ApiEnvelope, BackendHotspot } from "./shared";

function unwrapAdminData<T>(response: { data: ApiEnvelope<T> }) {
  return response.data.data;
}

export type AdminRole = "ops" | "super";

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  adminRole: AdminRole;
}

export interface MarketConfig {
  id: string;
  city: string;
  country: string;
  notificationRadiusMeters: number;
  driverPerAttendeeRatio: number;
  minDriversPerZone: number;
  alertRadiusMeters: number;
  isActive: boolean;
  updatedAt: string;
}

export interface OnlineDriver {
  id: string;
  fullName: string;
  planTier: string;
  location: {
    lat: number;
    lng: number;
  };
  lastSeen: string;
  zonesIn: string[];
}

export interface AdminHotspot {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  radius_meters: number;
  demand_level: "very-high" | "high" | "medium" | "low";
  demand_score: number;
  drivers_needed: number;
  insight_text: string | null;
  active_time_start: string | null;
  active_time_end: string | null;
  drivers_in_zone: number;
  isCovered: boolean;
  coverageRatio: number;
}

export interface NotificationLog {
  id: string;
  type: string;
  title: string | null;
  body: string | null;
  wasDelivered: boolean;
  wasActedOn: boolean;
  sentAt: string;
  driverName: string | null;
  hotspotName: string | null;
}

export interface MlStatus {
  serviceReachable: boolean;
  modelLoaded: boolean;
  loaded: boolean;
  accuracy: number | null;
  operatingAccuracyTarget: number | null;
  operatingConfidenceThreshold: number | null;
  modelVersion: string | null;
  lastError: string | null;
  healthUrl: string;
  checkedAt: string;
}

export interface AdminEventInput {
  name: string;
  venueName?: string | null;
  lat: number;
  lng: number;
  address?: string | null;
  city: string;
  country: string;
  startTime: string;
  endTime?: string | null;
  expectedAttendance?: number | null;
  eventType?: string | null;
  eventCategory?: string | null;
}

export interface AdminEvent extends AdminEventInput {
  id: string;
  source: string;
  isActive: boolean;
  location: {
    lat: number;
    lng: number;
  };
}

export interface OcrExtractedEvent {
  name: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  startTime: string | null;
  endTime: string | null;
  expectedAttendance: number | null;
  eventType: string | null;
  eventCategory: string | null;
  confidence: number;
  missingFields: string[];
}

export interface EventOcrResult {
  extractedEvent: OcrExtractedEvent;
  confidence: number;
  missingFields: string[];
  rawText: string;
  providerDiagnostics: Record<string, unknown>;
}

export const adminRepository = {
  async login(input: { email: string; password: string }) {
    const response = await adminApi.post("/api/admin/auth/login", input);
    return unwrapAdminData<{ token: string; admin: AdminUser }>(response);
  },

  async getMarketConfigs() {
    const response = await adminApi.get("/api/admin/config/markets");
    return unwrapAdminData<MarketConfig[]>(response);
  },

  async updateMarketConfig(city: string, input: Omit<MarketConfig, "id" | "city" | "country" | "isActive" | "updatedAt">) {
    const response = await adminApi.put(`/api/admin/config/markets/${encodeURIComponent(city)}`, input);
    return unwrapAdminData<MarketConfig>(response);
  },

  async getOnlineDrivers() {
    const response = await adminApi.get("/api/admin/drivers/online");
    return unwrapAdminData<OnlineDriver[]>(response);
  },

  async getActiveHotspots() {
    const response = await adminApi.get("/api/admin/hotspots/active");
    return unwrapAdminData<AdminHotspot[]>(response);
  },

  async getNotificationLogs(limit = 100) {
    const response = await adminApi.get("/api/admin/notifications/logs", {
      params: { limit }
    });
    return unwrapAdminData<NotificationLog[]>(response);
  },

  async getMlStatus() {
    const response = await adminApi.get("/api/admin/ml/status");
    return unwrapAdminData<MlStatus>(response);
  },

  async triggerMlRetrain() {
    const response = await adminApi.post("/api/admin/ml/retrain");
    return unwrapAdminData<Record<string, unknown>>(response);
  },

  async getEvents(limit = 100) {
    const response = await adminApi.get("/api/admin/events", {
      params: { limit }
    });
    return unwrapAdminData<AdminEvent[]>(response);
  },

  async createEvent(input: AdminEventInput) {
    const response = await adminApi.post("/api/admin/events", input);
    return unwrapAdminData<{ id: string }>(response);
  },

  async extractEventFromFlyer(file: File) {
    const data = new FormData();
    data.append("file", file);
    const response = await adminApi.post("/api/admin/events/ocr", data);
    return unwrapAdminData<EventOcrResult>(response);
  },

  async updateEvent(id: string, input: AdminEventInput) {
    const response = await adminApi.put(`/api/admin/events/${id}`, input);
    return unwrapAdminData<{ id: string }>(response);
  },

  async deleteEvent(id: string) {
    const response = await adminApi.delete(`/api/admin/events/${id}`);
    return unwrapAdminData<{ id: string }>(response);
  }
};

export type { BackendHotspot };
