import type { DemandLevel } from "@/lib/demandColors";

export type { DemandLevel } from "@/lib/demandColors";

export type PlanTier = "free" | "pro" | "fleet";

export interface DriverLocation {
  lat: number;
  lng: number;
}

export type NavigationStatus = "idle" | "starting" | "active" | "failed";

export interface NavigationSession {
  id: string;
  hotspotId: string;
  status: "active" | "completed" | "cancelled";
  origin: DriverLocation;
  destination: DriverLocation;
  encodedPolyline: string;
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  arrivalTime: string;
  provider: "google-routes" | "fallback";
  fallbackUsed: boolean;
  startedAt?: string;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

export interface HotspotSearchMetadata {
  requestedRadiusMeters: number;
  effectiveRadiusMeters: number;
  targetCount: number;
  returnedCount: number;
  expandedRadius: boolean;
  liveWindow: "ending_within_1_hour";
  shortfallReason?: string | null;
  refreshing?: boolean;
  lastRefreshedAt?: string | null;
}

export interface Hotspot {
  id: string;
  name: string;
  postcode: string;
  demandLevel: DemandLevel;
  timeRange: string;
  driveTime: string;
  distance: string;
  driverSaturation: string;
  lat: number;
  lng: number;
  liveScore: number;
  insightText: string;
  demandByHour: number[];
  currentHourIndex: number;
  image: string | null;
  demandScore?: number;
  activeTimeStart?: string | null;
  activeTimeEnd?: string | null;
  generatedAt?: string;
  driversNeeded?: number;
  driversInZone?: number;
  isCovered?: boolean;
  mlConfidence?: number;
  predictionMode?: "ml-certified" | "conservative-fallback";
  isHighConfidence?: boolean;
  operatingConfidenceThreshold?: number;
  operatingAccuracyTarget?: number;
  fallbackReason?: string | null;
  routingDecision?: "go" | "watch" | "avoid";
  canNavigate?: boolean;
  isSuppressed?: boolean;
  city?: string | null;
  country?: string | null;
  source?: string | null;
  sourceUrl?: string | null;
  venueName?: string | null;
  estimatedEndTime?: boolean;
  minutesUntilEnd?: number | null;
  effectiveDistanceMeters?: number | null;
}

export interface DemandVisual {
  label: string;
  shortLabel?: string;
  pinColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  glowColor?: string;
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  avatarUrl?: string | null;
  planTier: PlanTier;
  isEmailVerified?: boolean;
}

export interface NotificationPreferences {
  mailNotifications: boolean;
  demandNotifications: boolean;
  nightModeAlerts: boolean;
}

export type AppNotificationType =
  | "hotspot_alert"
  | "coverage_sufficient"
  | "surge_alert"
  | "system"
  | "test";

export interface AppNotification {
  id: string;
  driverId?: string | null;
  hotspotId?: string | null;
  type: AppNotificationType;
  title: string;
  body: string;
  wasDelivered: boolean;
  wasActedOn: boolean;
  isRead: boolean;
  readAt?: string | null;
  sentAt: string;
  data?: Record<string, unknown>;
}

export interface Profile {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  country?: string | null;
  avatarUrl?: string | null;
  planTier: PlanTier;
  isEmailVerified: boolean;
  notificationPreferences: NotificationPreferences;
}

export interface SubscriptionPlan {
  tier: PlanTier;
  monthlyPriceLabel: string;
  subtitle: string;
  ctaLabel: string;
  featured?: boolean;
  features: Array<{
    copy: string;
    included: boolean;
  }>;
}

export interface ToastMessage {
  id: string;
  title: string;
  variant: "success" | "neutral" | "alert" | "info";
  durationMs?: number;
}
