import type { AxiosResponse } from "axios";
import type { AuthUser, Hotspot, PlanTier, Profile } from "@/types";
import type { DemandLevel } from "@/types";

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface BackendDriverSummary {
  id: string;
  fullName: string;
  email: string;
  planTier: PlanTier;
  country?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  isEmailVerified?: boolean;
}

export interface BackendProfile {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  avatarUrl?: string | null;
  planTier: PlanTier;
  isEmailVerified: boolean;
  notificationPreferences: {
    mailNotifications: boolean;
    demandNotifications: boolean;
    nightModeAlerts: boolean;
  };
}

export interface BackendHotspot {
  id: string;
  name: string;
  postcode?: string | null;
  location?: {
    lat: number;
    lng: number;
  };
  demandLevel: DemandLevel;
  demandScore: number;
  liveScore: number;
  driveTimeText: string;
  distanceText: string;
  driverSaturation: string;
  mlConfidence?: number;
  predictionMode?: "ml-certified" | "conservative-fallback";
  isHighConfidence?: boolean;
  operatingConfidenceThreshold?: number;
  operatingAccuracyTarget?: number;
  fallbackReason?: string | null;
  routingDecision?: "go" | "watch" | "avoid";
  canNavigate?: boolean;
  isSuppressed?: boolean;
  driversNeeded?: number;
  driversInZone?: number;
  isCovered?: boolean;
  insightText: string;
  activeTimeStart?: string | null;
  activeTimeEnd?: string | null;
  timeRange: string;
  imageUrl?: string | null;
  generatedAt?: string;
  city?: string | null;
  country?: string | null;
  lat?: number;
  lng?: number;
  radius_meters?: number;
  demand_level?: DemandLevel;
  demand_score?: number;
  live_score?: number;
  drive_time_text?: string | null;
  distance_text?: string | null;
  driver_saturation?: string | null;
  ml_confidence?: number;
  prediction_mode?: "ml-certified" | "conservative-fallback";
  is_high_confidence?: boolean;
  operating_confidence_threshold?: number;
  operating_accuracy_target?: number;
  fallback_reason?: string | null;
  routing_decision?: "go" | "watch" | "avoid";
  can_navigate?: boolean;
  is_suppressed?: boolean;
  drivers_needed?: number;
  drivers_in_zone?: number;
  insight_text?: string | null;
  active_time_start?: string | null;
  active_time_end?: string | null;
}

export interface BackendDemandByHour {
  hours: string[];
  values: number[];
  currentHourIndex: number;
  timeRange: string;
}

export function unwrapData<T>(response: AxiosResponse<ApiEnvelope<T>>) {
  return response.data.data;
}

export function mapDriverSummaryToAuthUser(driver: BackendDriverSummary): AuthUser {
  return {
    id: driver.id,
    fullName: driver.fullName,
    email: driver.email,
    phone: driver.phone ?? null,
    country: driver.country ?? null,
    avatarUrl: driver.avatarUrl ?? null,
    planTier: driver.planTier,
    isEmailVerified: driver.isEmailVerified
  };
}

export function mapProfile(profile: BackendProfile): Profile {
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone ?? null,
    country: profile.country ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    planTier: profile.planTier,
    isEmailVerified: profile.isEmailVerified,
    notificationPreferences: profile.notificationPreferences
  };
}

export function mapHotspot(hotspot: BackendHotspot): Hotspot {
  const demandLevel = hotspot.demandLevel ?? hotspot.demand_level ?? "low";
  const demandScore = hotspot.demandScore ?? hotspot.demand_score ?? 0;
  const liveScore = hotspot.liveScore ?? hotspot.live_score ?? Math.round(demandScore);
  const activeTimeStart = hotspot.activeTimeStart ?? hotspot.active_time_start ?? null;
  const activeTimeEnd = hotspot.activeTimeEnd ?? hotspot.active_time_end ?? null;
  const driversNeeded = hotspot.driversNeeded ?? hotspot.drivers_needed;
  const driversInZone = hotspot.driversInZone ?? hotspot.drivers_in_zone;
  const routingDecision = hotspot.routingDecision ?? hotspot.routing_decision ?? "watch";
  const isCovered =
    hotspot.isCovered ??
    (typeof driversNeeded === "number" && typeof driversInZone === "number"
      ? driversInZone >= driversNeeded
      : false);
  const canNavigate =
    hotspot.canNavigate ?? hotspot.can_navigate ?? (!isCovered && routingDecision === "go");

  return {
    id: hotspot.id,
    name: hotspot.name,
    postcode: hotspot.postcode ?? "",
    demandLevel,
    timeRange: hotspot.timeRange ?? "10:45 PM - 11:30 PM",
    driveTime: hotspot.driveTimeText ?? hotspot.drive_time_text ?? "ETA unavailable",
    distance: hotspot.distanceText ?? hotspot.distance_text ?? "Distance unavailable",
    driverSaturation: hotspot.driverSaturation ?? hotspot.driver_saturation ?? "LOW",
    lat: hotspot.location?.lat ?? hotspot.lat ?? 0,
    lng: hotspot.location?.lng ?? hotspot.lng ?? 0,
    liveScore,
    insightText:
      hotspot.insightText ??
      hotspot.insight_text ??
      "Strong rider activity is expected in this area over the next hour.",
    demandByHour: [],
    currentHourIndex: 0,
    image: hotspot.imageUrl ?? null,
    demandScore,
    activeTimeStart,
    activeTimeEnd,
    generatedAt: hotspot.generatedAt,
    mlConfidence: hotspot.mlConfidence ?? hotspot.ml_confidence ?? 0,
    predictionMode:
      hotspot.predictionMode ?? hotspot.prediction_mode ?? "conservative-fallback",
    isHighConfidence: hotspot.isHighConfidence ?? hotspot.is_high_confidence ?? false,
    operatingConfidenceThreshold:
      hotspot.operatingConfidenceThreshold ?? hotspot.operating_confidence_threshold ?? 0.96,
    operatingAccuracyTarget:
      hotspot.operatingAccuracyTarget ?? hotspot.operating_accuracy_target ?? 0.98,
    fallbackReason: hotspot.fallbackReason ?? hotspot.fallback_reason ?? null,
    routingDecision,
    canNavigate,
    isSuppressed:
      hotspot.isSuppressed ?? hotspot.is_suppressed ?? (isCovered || routingDecision === "avoid"),
    driversNeeded,
    driversInZone,
    isCovered,
    city: hotspot.city ?? null,
    country: hotspot.country ?? null
  };
}
