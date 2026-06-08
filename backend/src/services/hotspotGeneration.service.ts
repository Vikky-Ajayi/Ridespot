import { query, withTransaction } from "../config/database.js";
import type { ActiveEventRow } from "../modules/events/events.service.js";
import { predictDemand, type PredictionInput } from "./ml.service.js";
import { getGooglePlacesPopularity } from "./googlePlaces.service.js";
import { getTrafficScore } from "./hereMaps.service.js";

export type GeneratedHotspot = {
  eventId: string;
  name: string;
  postcode: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  demandLevel: "very-high" | "high" | "medium" | "low";
  demandScore: number;
  liveScore: number;
  driversNeeded: number;
  radiusMeters: number;
  driverSaturation: "LOW" | "MEDIUM" | "HIGH";
  mlConfidence: number;
  predictionMode: "ml-certified" | "conservative-fallback";
  isHighConfidence: boolean;
  operatingConfidenceThreshold: number;
  operatingAccuracyTarget: number;
  fallbackReason: string | null;
  routingDecision: "go" | "watch" | "avoid";
  insightText: string;
  activeTimeStart: string;
  activeTimeEnd: string;
  expiresAt: string;
};

async function driversNear(lat: number, lng: number) {
  const result = await query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM driver_locations
     WHERE is_online = TRUE
       AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 300)`,
    [lat, lng]
  );

  return Number(result.rows[0]?.total ?? 0);
}

function normaliseDriverSaturation(currentDrivers: number, driversNeeded: number) {
  const ratio = currentDrivers / Math.max(driversNeeded, 1);
  if (ratio >= 1) return "HIGH" as const;
  if (ratio >= 0.5) return "MEDIUM" as const;
  return "LOW" as const;
}

function buildPredictionInput(
  event: ActiveEventRow,
  context: {
    currentDrivers: number;
    trafficScore: number | null;
    popularityScore: number | null;
  }
): PredictionInput {
  const startTime = new Date(event.start_time);
  const endTime = event.end_time
    ? new Date(event.end_time)
    : new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  const durationHours = Math.max(
    0.5,
    Number(((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60)).toFixed(2))
  );

  return {
    eventType: event.event_type ?? "Concert",
    eventCategory: event.event_category ?? "Entertainment",
    city: event.city ?? "Unknown",
    country: event.country ?? "Unknown",
    venueCapacity: event.expected_attendance ?? 1000,
    expectedAttendance: event.expected_attendance ?? 500,
    startHour: startTime.getHours(),
    endHour: endTime.getHours(),
    durationHours,
    isWeekend: [0, 6].includes(startTime.getDay()) ? 1 : 0,
    isPublicHoliday: 0,
    isDettyDecember: startTime.getMonth() === 11 ? 1 : 0,
    weatherCondition: "Clear",
    socialBuzzScore: Math.min(100, Math.max(0, (context.popularityScore ?? 10) * 5)),
    nearbyCompetingEvents: 0,
    driverSupplyIndex: Math.min(1, Math.max(0, context.currentDrivers / 10)),
    fuelAvailabilityIndex: 1.0,
    roadCongestionIndex: Math.max(0, 1 - (context.trafficScore ?? 0) / 20),
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

export async function upsertGeneratedHotspots(hotspots: GeneratedHotspot[]) {
  if (!hotspots.length) {
    return;
  }

  await withTransaction(async (client) => {
    for (const hotspot of hotspots) {
      const upsertResult = await client.query<{ id: string }>(
        `INSERT INTO hotspots (
           name, postcode, location, radius_meters, demand_level, demand_score, live_score,
           drive_time_text, distance_text, driver_saturation, ml_confidence, prediction_mode,
           is_high_confidence, operating_confidence_threshold, operating_accuracy_target,
           fallback_reason, routing_decision, insight_text, drivers_needed,
           active_time_start, active_time_end, event_id, is_active, generated_at, expires_at
         ) VALUES (
           $1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, $7, $8,
           NULL, NULL, $9, $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19, $20, $21, TRUE, NOW(), $22
         )
         ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO UPDATE SET
           name = EXCLUDED.name,
           postcode = EXCLUDED.postcode,
           location = EXCLUDED.location,
           radius_meters = EXCLUDED.radius_meters,
           demand_level = EXCLUDED.demand_level,
           demand_score = EXCLUDED.demand_score,
           live_score = EXCLUDED.live_score,
           drive_time_text = EXCLUDED.drive_time_text,
           distance_text = EXCLUDED.distance_text,
           driver_saturation = EXCLUDED.driver_saturation,
           ml_confidence = EXCLUDED.ml_confidence,
           prediction_mode = EXCLUDED.prediction_mode,
           is_high_confidence = EXCLUDED.is_high_confidence,
           operating_confidence_threshold = EXCLUDED.operating_confidence_threshold,
           operating_accuracy_target = EXCLUDED.operating_accuracy_target,
           fallback_reason = EXCLUDED.fallback_reason,
           routing_decision = EXCLUDED.routing_decision,
           insight_text = EXCLUDED.insight_text,
           drivers_needed = EXCLUDED.drivers_needed,
           active_time_start = EXCLUDED.active_time_start,
           active_time_end = EXCLUDED.active_time_end,
           generated_at = NOW(),
           expires_at = EXCLUDED.expires_at
         RETURNING id`,
        [
          hotspot.name,
          hotspot.postcode,
          hotspot.lat,
          hotspot.lng,
          hotspot.radiusMeters,
          hotspot.demandLevel,
          hotspot.demandScore,
          hotspot.liveScore,
          hotspot.driverSaturation,
          hotspot.mlConfidence,
          hotspot.predictionMode,
          hotspot.isHighConfidence,
          hotspot.operatingConfidenceThreshold,
          hotspot.operatingAccuracyTarget,
          hotspot.fallbackReason,
          hotspot.routingDecision,
          hotspot.insightText,
          hotspot.driversNeeded,
          hotspot.activeTimeStart,
          hotspot.activeTimeEnd,
          hotspot.eventId,
          hotspot.expiresAt
        ]
      );

      const hotspotId = upsertResult.rows[0]?.id;
      if (!hotspotId) {
        continue;
      }

      await client.query(
        `INSERT INTO hotspot_snapshots (
           hotspot_id, event_id, name, postcode, location, radius_meters,
           demand_level, demand_score, live_score, drive_time_text, distance_text,
           driver_saturation, ml_confidence, prediction_mode, is_high_confidence,
           operating_confidence_threshold, operating_accuracy_target, fallback_reason,
           routing_decision, insight_text, drivers_needed, active_time_start, active_time_end,
           generated_at
         ) VALUES (
           $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $7,
           $8, $9, $10, NULL, NULL,
           $11, $12, $13, $14,
           $15, $16, $17,
           $18, $19, $20, $21, $22,
           NOW()
         )`,
        [
          hotspotId,
          hotspot.eventId,
          hotspot.name,
          hotspot.postcode,
          hotspot.lat,
          hotspot.lng,
          hotspot.radiusMeters,
          hotspot.demandLevel,
          hotspot.demandScore,
          hotspot.liveScore,
          hotspot.driverSaturation,
          hotspot.mlConfidence,
          hotspot.predictionMode,
          hotspot.isHighConfidence,
          hotspot.operatingConfidenceThreshold,
          hotspot.operatingAccuracyTarget,
          hotspot.fallbackReason,
          hotspot.routingDecision,
          hotspot.insightText,
          hotspot.driversNeeded,
          hotspot.activeTimeStart,
          hotspot.activeTimeEnd
        ]
      );
    }

    await client.query(
      `DELETE FROM hotspot_snapshots
       WHERE generated_at < NOW() - INTERVAL '48 hours'`
    );
  });
}

export async function generateHotspotsFromEvents(events: ActiveEventRow[]) {
  const hotspots: GeneratedHotspot[] = [];

  for (const event of events) {
    const currentDrivers = await driversNear(event.lat, event.lng);
    const [trafficScore, popularityScore] = await Promise.all([
      getTrafficScore(event.lat, event.lng),
      getGooglePlacesPopularity(event.lat, event.lng)
    ]);

    const prediction = await predictDemand(
      buildPredictionInput(event, {
        currentDrivers,
        trafficScore,
        popularityScore
      })
    );
    const driversNeeded = Math.max(1, prediction.driversNeeded);

    hotspots.push({
      eventId: event.id,
      name: event.venue_name ?? event.name,
      postcode: null,
      city: event.city,
      country: event.country,
      lat: event.lat,
      lng: event.lng,
      demandLevel: prediction.demandLevel,
      demandScore: prediction.demandScore,
      liveScore: Math.round(prediction.demandScore),
      driversNeeded,
      radiusMeters: prediction.optimalRadiusMeters,
      driverSaturation: normaliseDriverSaturation(currentDrivers, driversNeeded),
      mlConfidence: prediction.confidence,
      predictionMode: prediction.predictionMode,
      isHighConfidence: prediction.isHighConfidence,
      operatingConfidenceThreshold: prediction.operatingConfidenceThreshold,
      operatingAccuracyTarget: prediction.operatingAccuracyTarget,
      fallbackReason: prediction.fallbackReason,
      routingDecision: prediction.routingDecision,
      insightText: prediction.insightText,
      activeTimeStart: event.start_time,
      activeTimeEnd:
        event.end_time ?? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    });
  }

  await upsertGeneratedHotspots(hotspots);
  return hotspots;
}
