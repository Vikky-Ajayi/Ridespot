import axios from "axios";
import { env } from "../config/env.js";
import { scoreDemand, type DemandLevel } from "../utils/demandScorer.js";
import type { EventInput } from "../utils/normalise.js";

const mlClient = axios.create({
  baseURL: env.ML_SERVICE_URL,
  timeout: 5000
});

export interface PredictionInput {
  eventType: string;
  eventCategory: string;
  city: string;
  country: string;
  venueCapacity: number;
  expectedAttendance: number;
  startHour: number;
  endHour: number;
  durationHours: number;
  isWeekend: number;
  isPublicHoliday: number;
  isDettyDecember: number;
  weatherCondition?: string;
  socialBuzzScore?: number;
  nearbyCompetingEvents?: number;
  driverSupplyIndex?: number;
  fuelAvailabilityIndex?: number;
  roadCongestionIndex?: number;
  securityIndex?: number;
  powerReliabilityIndex?: number;
  publicTransportDisruption?: number;
  tubeStrikeActive?: number;
  venueTransportScore?: number;
  venueNearbyBars?: number;
  venueParkingSpaces?: number;
  avgTaxiWaitPreEventMins?: number;
  venueHistoricalPerfIndex?: number;
}

export interface PredictionResult {
  demandLevel: DemandLevel;
  demandScore: number;
  confidence: number;
  predictionMode: "ml-certified" | "conservative-fallback";
  isHighConfidence: boolean;
  operatingConfidenceThreshold: number;
  operatingAccuracyTarget: number;
  fallbackReason: string | null;
  routingDecision: "go" | "watch" | "avoid";
  driversNeeded: number;
  optimalRadiusMeters: number;
  peakBookingWindowMins: number;
  insightText: string;
  modelVersion: string;
}

export interface LegacyPredictionRequest {
  event: EventInput;
  trafficScore?: number | null;
  popularityScore?: number | null;
  currentDrivers?: number | null;
}

export type PredictionRequest = LegacyPredictionRequest;

export interface LegacyPredictionResponse {
  demandLevel: DemandLevel;
  demandScore: number;
  liveScore: number;
  driverSaturation: "LOW" | "MEDIUM" | "HIGH";
  insightText: string;
  radiusMeters?: number;
}

type MlPredictionResponse = {
  demand_level: DemandLevel;
  demand_score: number;
  confidence: number;
  drivers_needed: number;
  prediction_mode: "ml-certified" | "conservative-fallback";
  is_high_confidence: boolean;
  operating_confidence_threshold: number;
  operating_accuracy_target: number;
  fallback_reason: string | null;
  optimal_radius_meters: number;
  peak_booking_window_mins: number;
  insight_text: string;
  model_version: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toSnakeCase(input: PredictionInput): Record<string, unknown> {
  return {
    event_type: input.eventType,
    event_category: input.eventCategory,
    city: input.city,
    country: input.country,
    venue_capacity: input.venueCapacity,
    expected_attendance: input.expectedAttendance,
    start_hour: input.startHour,
    end_hour: input.endHour,
    duration_hours: input.durationHours,
    is_weekend: input.isWeekend,
    is_public_holiday: input.isPublicHoliday,
    is_detty_december: input.isDettyDecember,
    weather_condition: input.weatherCondition ?? "Clear",
    social_buzz_score: input.socialBuzzScore ?? 50,
    nearby_competing_events: input.nearbyCompetingEvents ?? 0,
    driver_supply_index: input.driverSupplyIndex ?? 0.5,
    fuel_availability_index: input.fuelAvailabilityIndex ?? 1.0,
    road_congestion_index: input.roadCongestionIndex ?? 1.0,
    security_index: input.securityIndex ?? 1.0,
    power_reliability_index: input.powerReliabilityIndex ?? 1.0,
    public_transport_disruption: input.publicTransportDisruption ?? 0,
    tube_strike_active: input.tubeStrikeActive ?? 0,
    venue_transport_score: input.venueTransportScore ?? 7,
    venue_nearby_bars: input.venueNearbyBars ?? 10,
    venue_parking_spaces: input.venueParkingSpaces ?? 500,
    avg_taxi_wait_pre_event_mins: input.avgTaxiWaitPreEventMins ?? 10,
    venue_historical_perf_index: input.venueHistoricalPerfIndex ?? 1.0
  };
}

function mapEventToPredictionInput(payload: LegacyPredictionRequest): PredictionInput {
  const startTime = payload.event.startTime;
  const endTime = payload.event.endTime ?? new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  const durationHours = Math.max(
    0.5,
    Number(((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(2))
  );
  const currentDrivers = payload.currentDrivers ?? 0;

  return {
    eventType: payload.event.eventType ?? "Concert",
    eventCategory: payload.event.eventCategory ?? "Entertainment",
    city: payload.event.city,
    country: payload.event.country,
    venueCapacity: payload.event.expectedAttendance ?? 1000,
    expectedAttendance: payload.event.expectedAttendance ?? 500,
    startHour: startTime.getHours(),
    endHour: endTime.getHours(),
    durationHours,
    isWeekend: [0, 6].includes(startTime.getDay()) ? 1 : 0,
    isPublicHoliday: 0,
    isDettyDecember: startTime.getMonth() === 11 ? 1 : 0,
    weatherCondition: "Clear",
    socialBuzzScore: clamp((payload.popularityScore ?? 10) * 5, 0, 100),
    nearbyCompetingEvents: 0,
    driverSupplyIndex: clamp(currentDrivers / 10, 0, 1),
    fuelAvailabilityIndex: 1.0,
    roadCongestionIndex: 1.0,
    securityIndex: 1.0,
    powerReliabilityIndex: 1.0,
    publicTransportDisruption: 0,
    tubeStrikeActive: 0,
    venueTransportScore: 7,
    venueNearbyBars: 10,
    venueParkingSpaces: 500,
    avgTaxiWaitPreEventMins: 10,
    venueHistoricalPerfIndex: 1.0
  };
}

function ruleBasedFallback(input: PredictionInput): PredictionResult {
  let score = 50;

  if (input.isWeekend) score += 10;
  if (input.isPublicHoliday) score += 15;
  if (input.isDettyDecember) score += 20;
  if (input.endHour <= 5 || input.endHour >= 22) score += 15;

  const fillRate = input.expectedAttendance / Math.max(input.venueCapacity, 1);
  score += fillRate * 20;
  score = clamp(score, 0, 100);

  const demandLevel =
    score >= 78 ? "very-high" : score >= 55 ? "high" : score >= 32 ? "medium" : "low";

  return {
    demandLevel,
    demandScore: Number(score.toFixed(2)),
    confidence: 0.6,
    predictionMode: "conservative-fallback",
    isHighConfidence: false,
    operatingConfidenceThreshold: 0.96,
    operatingAccuracyTarget: 0.98,
    fallbackReason: "ML service unavailable; rule engine returned a conservative advisory prediction.",
    routingDecision: "watch",
    driversNeeded: Math.ceil(input.expectedAttendance / 10),
    optimalRadiusMeters: 300,
    peakBookingWindowMins: 20,
    insightText: "Prediction based on rule engine (ML service unavailable).",
    modelVersion: "rule-based-fallback"
  };
}

function toLegacyPredictionResult(
  result: PredictionResult,
  payload: LegacyPredictionRequest
): LegacyPredictionResponse {
  const currentDrivers = payload.currentDrivers ?? 0;
  const driversNeeded = Math.max(1, result.driversNeeded);
  const saturationRatio = currentDrivers / driversNeeded;
  const driverSaturation =
    saturationRatio >= 1 ? "HIGH" : saturationRatio >= 0.5 ? "MEDIUM" : "LOW";

  return {
    demandLevel: result.demandLevel,
    demandScore: result.demandScore,
    liveScore: Math.round(result.demandScore),
    driverSaturation,
    insightText: result.insightText,
    radiusMeters: result.optimalRadiusMeters
  };
}

function isDemandLevel(value: unknown): value is DemandLevel {
  return value === "very-high" || value === "high" || value === "medium" || value === "low";
}

function isPredictionMode(value: unknown): value is MlPredictionResponse["prediction_mode"] {
  return value === "ml-certified" || value === "conservative-fallback";
}

function toRoutingDecision(
  demandLevel: DemandLevel,
  isHighConfidence: boolean
): PredictionResult["routingDecision"] {
  if (!isHighConfidence) {
    return "watch";
  }

  return demandLevel === "high" || demandLevel === "very-high" ? "go" : "avoid";
}

function parsePredictionResponse(data: unknown): MlPredictionResponse {
  if (!data || typeof data !== "object") {
    throw new Error("ML prediction response was not an object");
  }

  const prediction = data as Partial<MlPredictionResponse>;
  if (
    !isDemandLevel(prediction.demand_level) ||
    typeof prediction.demand_score !== "number" ||
    typeof prediction.confidence !== "number" ||
    !isPredictionMode(prediction.prediction_mode) ||
    typeof prediction.is_high_confidence !== "boolean" ||
    typeof prediction.operating_confidence_threshold !== "number" ||
    typeof prediction.operating_accuracy_target !== "number" ||
    (typeof prediction.fallback_reason !== "string" && prediction.fallback_reason !== null) ||
    typeof prediction.drivers_needed !== "number" ||
    typeof prediction.optimal_radius_meters !== "number" ||
    typeof prediction.peak_booking_window_mins !== "number" ||
    typeof prediction.insight_text !== "string" ||
    typeof prediction.model_version !== "string"
  ) {
    throw new Error("ML prediction response did not match RideSpot schema");
  }

  return prediction as MlPredictionResponse;
}

export async function predictDemand(input: PredictionInput): Promise<PredictionResult> {
  try {
    const response = await mlClient.post("/predict", toSnakeCase(input));
    const data = parsePredictionResponse(response.data);

    return {
      demandLevel: data.demand_level,
      demandScore: data.demand_score,
      confidence: data.confidence,
      predictionMode: data.prediction_mode,
      isHighConfidence: data.is_high_confidence,
      operatingConfidenceThreshold: data.operating_confidence_threshold,
      operatingAccuracyTarget: data.operating_accuracy_target,
      fallbackReason: data.fallback_reason,
      routingDecision: toRoutingDecision(data.demand_level, data.is_high_confidence),
      driversNeeded: data.drivers_needed,
      optimalRadiusMeters: data.optimal_radius_meters,
      peakBookingWindowMins: data.peak_booking_window_mins,
      insightText: data.insight_text,
      modelVersion: data.model_version
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ML service error";
    console.error("ML service unavailable, using rule-based fallback:", message);
    return ruleBasedFallback(input);
  }
}

export async function getModelHealth(): Promise<{
  loaded: boolean;
  accuracy: number | null;
  operatingAccuracyTarget: number | null;
  operatingConfidenceThreshold: number | null;
}> {
  try {
    const response = await mlClient.get("/health", { timeout: 3000 });
    const data = response.data as {
      model_loaded?: unknown;
      accuracy?: unknown;
      operating_accuracy_target?: unknown;
      operating_confidence_threshold?: unknown;
    };
    if (
      typeof data.model_loaded !== "boolean" ||
      (typeof data.accuracy !== "number" && data.accuracy !== null)
    ) {
      throw new Error("ML health response did not match RideSpot schema");
    }

    return {
      loaded: data.model_loaded,
      accuracy: data.accuracy,
      operatingAccuracyTarget:
        typeof data.operating_accuracy_target === "number" ? data.operating_accuracy_target : null,
      operatingConfidenceThreshold:
        typeof data.operating_confidence_threshold === "number"
          ? data.operating_confidence_threshold
          : null
    };
  } catch {
    return {
      loaded: false,
      accuracy: null,
      operatingAccuracyTarget: null,
      operatingConfidenceThreshold: null
    };
  }
}

export async function triggerModelRetrain(): Promise<unknown> {
  try {
    const response = await mlClient.post("/retrain", {}, { timeout: 15000 });
    if (!response.data || typeof response.data !== "object") {
      throw new Error("ML retrain response did not match RideSpot schema");
    }

    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ML retrain error";
    return {
      status: "unavailable",
      reason: message
    };
  }
}

export async function predictHotspotDemand(
  payload: LegacyPredictionRequest
): Promise<LegacyPredictionResponse> {
  const result = await predictDemand(mapEventToPredictionInput(payload));
  return toLegacyPredictionResult(result, payload);
}
