import type { DemandLevel } from "./demandScorer.js";
import { normaliseDriverSaturation } from "./geospatial.js";

// Delivery hotspots are NOT run through the event-demand ML model (backend/src/services/ml.service.ts).
// That model was trained on ticketed-event attendance data (venue capacity, fill rate, "is Detty
// December", etc.) -- feeding restaurant-cluster density through it would mean inventing fake
// "expected attendance" numbers and reporting a confidence figure the model was never validated for.
// Instead this is an honest, deterministic, density-based scorer, always reported as
// predictionMode "conservative-fallback" with a clear fallbackReason.

export interface DeliveryDemandInput {
  venueCount: number;
  avgRating: number | null;
  totalRatingCount: number;
  currentDrivers: number;
  country: "Nigeria" | "UK" | string | null;
  now?: Date;
}

export interface DeliveryDemandResult {
  demandLevel: DemandLevel;
  demandScore: number;
  liveScore: number;
  driversNeeded: number;
  driverSaturation: "LOW" | "MEDIUM" | "HIGH";
  routingDecision: "go" | "watch" | "avoid";
  insightText: string;
}

function isLikelyBritishSummerTime(date: Date) {
  // Rough BST heuristic (last Sunday of March - last Sunday of October). Good enough for a
  // +/-1hr lunch/dinner-window boost; not used for anything that needs legal precision.
  const month = date.getUTCMonth();
  return month >= 3 && month <= 8;
}

function localHour(date: Date, country: DeliveryDemandInput["country"]) {
  const offsetHours = country === "Nigeria" ? 1 : isLikelyBritishSummerTime(date) ? 1 : 0;
  const local = new Date(date.getTime() + offsetHours * 60 * 60 * 1000);
  return local.getUTCHours() + local.getUTCMinutes() / 60;
}

function timeOfDayBoost(hour: number) {
  const inLunchWindow = hour >= 12 && hour < 14.5;
  const inDinnerWindow = hour >= 18 && hour < 21.5;
  const inLateSnackWindow = hour >= 21.5 && hour < 23.5;
  const inQuietWindow = hour >= 2.5 && hour < 10;

  if (inLunchWindow || inDinnerWindow) return 22;
  if (inLateSnackWindow) return 8;
  if (inQuietWindow) return -18;
  return 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function scoreDeliveryDemand(input: DeliveryDemandInput): DeliveryDemandResult {
  const now = input.now ?? new Date();
  const densityBoost = clamp(input.venueCount * 1.5, 0, 30);
  const popularityBoost = clamp(Math.log1p(input.totalRatingCount) * 3, 0, 20);
  const ratingQualityBoost = input.avgRating !== null ? clamp((input.avgRating - 3.5) * 6, -10, 10) : 0;
  const hour = localHour(now, input.country);
  const timeBoost = timeOfDayBoost(hour);

  const rawScore = 35 + densityBoost + popularityBoost + ratingQualityBoost + timeBoost;
  const score = Math.round(clamp(rawScore, 5, 100));

  const demandLevel: DemandLevel =
    score >= 85 ? "very-high" : score >= 70 ? "high" : score >= 45 ? "medium" : "low";

  const driversNeeded = Math.max(1, Math.ceil((input.venueCount / 8) * (score / 50)));
  const driverSaturation = normaliseDriverSaturation(input.currentDrivers, driversNeeded);
  const routingDecision: DeliveryDemandResult["routingDecision"] =
    score >= 70 ? "go" : score >= 45 ? "watch" : "avoid";

  const windowLabel =
    hour >= 12 && hour < 14.5
      ? "lunch rush"
      : hour >= 18 && hour < 21.5
        ? "dinner rush"
        : hour >= 21.5 && hour < 23.5
          ? "late-night orders"
          : "a quieter stretch";

  const insightText =
    demandLevel === "very-high" || demandLevel === "high"
      ? `${input.venueCount} restaurants clustered here, and it's ${windowLabel} -- order volume is likely elevated.`
      : demandLevel === "medium"
        ? `${input.venueCount} restaurants nearby with moderate order activity expected.`
        : `Restaurant density here is lower, or it's outside peak ordering hours.`;

  return {
    demandLevel,
    demandScore: Number((score / 1.05).toFixed(2)),
    liveScore: score,
    driversNeeded,
    driverSaturation,
    routingDecision,
    insightText
  };
}
