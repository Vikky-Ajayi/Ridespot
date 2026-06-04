import { Job, Queue, Worker } from "bullmq";
import { query, withTransaction } from "../config/database.js";
import { getRedisConnectionOptions } from "../config/redis.js";
import { eventsService } from "../modules/events/events.service.js";
import { hotspotService } from "../modules/hotspot/hotspot.service.js";
import { notificationsService } from "../modules/notifications/notifications.service.js";
import { predictDemand, type PredictionInput } from "../services/ml.service.js";
import { getGooglePlacesPopularity } from "../services/googlePlaces.service.js";
import { getTrafficScore } from "../services/hereMaps.service.js";
import { getHotspotsWithCoverage, type HotspotCoverage } from "../utils/geospatial.js";
import { getSocketServer } from "../websocket/socket.server.js";
import { broadcastHotspotUpdate } from "../websocket/hotspot.handler.js";

export const HOTSPOT_QUEUE_NAME = "hotspots";
export const hotspotQueue = new Queue(HOTSPOT_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

const SYSTEM_NOTIFICATION_DRIVER_ID = "00000000-0000-4000-8000-000000000000";

type GeneratedHotspot = {
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

export async function ensureHotspotRefreshSchedule() {
  await hotspotQueue.add(
    "refresh",
    {},
    {
      repeat: {
        pattern: "*/5 * * * *"
      },
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
}

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

function buildPredictionInput(event: Awaited<ReturnType<typeof eventsService.getActiveEventsWindow>>[number], context: {
  currentDrivers: number;
  trafficScore: number | null;
  popularityScore: number | null;
}): PredictionInput {
  const startTime = new Date(event.start_time);
  const endTime = event.end_time ? new Date(event.end_time) : new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
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

async function upsertHotspots(hotspots: GeneratedHotspot[]) {
  if (!hotspots.length) {
    return;
  }

  await withTransaction(async (client) => {
    for (const hotspot of hotspots) {
      await client.query(
        `INSERT INTO hotspots (
         name, postcode, location, radius_meters, demand_level, demand_score, live_score,
           drive_time_text, distance_text, driver_saturation, ml_confidence, prediction_mode,
           is_high_confidence, operating_confidence_threshold, operating_accuracy_target,
           fallback_reason, routing_decision, insight_text, drivers_needed,
           active_time_start, active_time_end, event_id, is_active, generated_at, expires_at
         ) VALUES (
           $1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, $7, $8,
           '8 min', '5.2 KM', $9, $10, $11, $12, $13, $14, $15, $16,
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
           expires_at = EXCLUDED.expires_at`,
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
    }
  });
}

async function generateHotspotsFromEvents() {
  const upcomingEvents = await eventsService.getActiveEventsWindow();
  const hotspots: GeneratedHotspot[] = [];

  for (const event of upcomingEvents) {
    const currentDrivers = await driversNear(event.lat, event.lng);
    const [trafficScore, popularityScore] = await Promise.all([
      getTrafficScore(event.lat, event.lng),
      getGooglePlacesPopularity(event.lat, event.lng)
    ]);

    const predictionInput = buildPredictionInput(event, {
      currentDrivers,
      trafficScore,
      popularityScore
    });

    const prediction = await predictDemand(predictionInput);
    const driversNeeded = Math.max(1, prediction.driversNeeded);

    hotspots.push({
      eventId: event.id,
      name: event.venue_name ?? event.name,
      postcode: "N5 1BU",
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

  await upsertHotspots(hotspots);
  return hotspots;
}

function groupCoverageByMarket(hotspots: HotspotCoverage[]) {
  const groups = new Map<string, HotspotCoverage[]>();

  for (const hotspot of hotspots) {
    const key = `${hotspot.city ?? "global"}|${hotspot.country ?? ""}`;
    const existing = groups.get(key) ?? [];
    existing.push(hotspot);
    groups.set(key, existing);
  }

  return [...groups.values()];
}

export async function runHotspotRefreshCycle() {
  await generateHotspotsFromEvents();

  const refreshedHotspots = await hotspotService.listBroadcastHotspots();

  try {
    const io = getSocketServer();
    const cities = ["Lagos", "Abuja", "London", "Manchester", "Birmingham"];
    for (const city of cities) {
      const cityHotspots = refreshedHotspots.filter((hotspot) => hotspot.city === city);
      if (cityHotspots.length) {
        broadcastHotspotUpdate(
          io,
          { city, country: cityHotspots[0]?.country ?? null },
          cityHotspots
        );
      }
    }
  } catch {
    // API process may not be running in the worker context.
  }

  const coverageHotspots = await getHotspotsWithCoverage();
  for (const group of groupCoverageByMarket(coverageHotspots)) {
    const first = group[0];
    await notificationsService.evaluateAndNotify(
      group,
      SYSTEM_NOTIFICATION_DRIVER_ID,
      first?.city ?? null,
      first?.country ?? null
    );
  }

  return {
    refreshed: refreshedHotspots.length,
    evaluatedCoverage: coverageHotspots.length
  };
}

export function createHotspotRefreshWorker() {
  return new Worker(
    HOTSPOT_QUEUE_NAME,
    async (_job: Job) => runHotspotRefreshCycle(),
    {
      connection: getRedisConnectionOptions()
    }
  );
}
