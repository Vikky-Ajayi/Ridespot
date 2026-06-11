import { query } from "../../config/database.js";
import {
  geographyPointSql,
  metersToKmText,
  normaliseDriverSaturation,
  selectLatLng
} from "../../utils/geospatial.js";
import { AppError } from "../../utils/http.js";
import type { PlanTier } from "../../utils/jwt.js";
import { getRouteEstimate, type RouteEstimate } from "../../services/routeEstimate.service.js";
import { areaRefreshService } from "./areaRefresh.service.js";

interface HotspotRow {
  id: string;
  name: string;
  postcode: string | null;
  demand_level: "very-high" | "high" | "medium" | "low";
  demand_score: string | number;
  live_score: number | null;
  drivers_needed?: number | string | null;
  drive_time_text: string | null;
  distance_text: string | null;
  driver_saturation: string | null;
  ml_confidence?: string | number | null;
  prediction_mode?: "ml-certified" | "conservative-fallback" | null;
  is_high_confidence?: boolean | null;
  operating_confidence_threshold?: string | number | null;
  operating_accuracy_target?: string | number | null;
  fallback_reason?: string | null;
  routing_decision?: "go" | "watch" | "avoid" | null;
  insight_text: string | null;
  active_time_start: string | null;
  active_time_end: string | null;
  generated_at: string;
  expires_at: string | null;
  city?: string | null;
  country?: string | null;
  source?: "ticketmaster" | "eventbrite" | "event_aggregator" | "manual" | string | null;
  source_url?: string | null;
  venue_name?: string | null;
  estimated_end_time?: boolean | null;
  minutes_until_end?: string | number | null;
  event_raw_data?: unknown;
  lat: number;
  lng: number;
  distance_meters?: number | string | null;
  drivers_in_zone?: string | number;
}

const REAL_HOTSPOT_EVENT_SOURCES = ["ticketmaster", "eventbrite", "event_aggregator", "manual"];
const HOTSPOT_TARGET_COUNT = 10;
const HOTSPOT_RADIUS_STEPS = [15000, 25000, 35000, 50000];
const LIVE_EVENT_WINDOW = "ending_within_1_hour";

function getRadiusSteps(requestedRadius: number) {
  const requested = Math.min(Math.max(Math.round(requestedRadius), 1), 50000);
  return Array.from(
    new Set([requested, ...HOTSPOT_RADIUS_STEPS.filter((radius) => radius > requested)])
  );
}

function formatRadiusKm(radiusMeters: number) {
  return `${Math.round(radiusMeters / 1000)}km`;
}

function formatWindow(start: string | null, end: string | null) {
  if (!start || !end) {
    return "10:45 PM - 11:30 PM";
  }

  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC"
  });

  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function realEventImageUrl(rawData: unknown) {
  const raw = asRecord(rawData);
  const ticketmasterImages = raw.images;

  if (Array.isArray(ticketmasterImages)) {
    const images = ticketmasterImages
      .map((image) => asRecord(image))
      .filter((image) => typeof image.url === "string");
    const preferred =
      images.find((image) => image.ratio === "16_9" && Number(image.width ?? 0) >= 640) ??
      images.find((image) => image.ratio === "16_9") ??
      images[0];

    if (typeof preferred?.url === "string") {
      return preferred.url;
    }
  }

  const logo = asRecord(raw.logo);
  const originalLogo = asRecord(logo.original);
  if (typeof originalLogo.url === "string") {
    return originalLogo.url;
  }

  if (typeof logo.url === "string") {
    return logo.url;
  }

  return null;
}

function normaliseDisplayText(value: string | null) {
  if (!value) {
    return null;
  }

  return value
    .replace(/3\S*\s+more requests/, "3x more requests")
    .replace(/\S*3,200\+/, "₦3,200+")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliseRoutingDecision(value: HotspotRow["routing_decision"]) {
  return value === "go" || value === "avoid" || value === "watch" ? value : "watch";
}

function mapHotspot(row: HotspotRow, routeEstimate?: RouteEstimate) {
  const driversNeeded = Number(row.drivers_needed ?? 1);
  const driversInZone = Number(row.drivers_in_zone ?? 0);
  const isCovered = driversInZone >= driversNeeded;
  const routingDecision = normaliseRoutingDecision(row.routing_decision);
  const distanceMeters =
    row.distance_meters === null || row.distance_meters === undefined
      ? null
      : Number(row.distance_meters);
  const minutesUntilEnd =
    row.minutes_until_end === null || row.minutes_until_end === undefined
      ? null
      : Math.max(0, Math.round(Number(row.minutes_until_end)));

  return {
    id: row.id,
    name: row.name,
    postcode: row.postcode ?? "",
    location: {
      lat: Number(row.lat),
      lng: Number(row.lng)
    },
    demandLevel: row.demand_level,
    demandScore: Number(row.demand_score),
    liveScore: row.live_score ?? Math.round(Number(row.demand_score)),
    driveTimeText: routeEstimate?.durationText ?? row.drive_time_text ?? "ETA unavailable",
    distanceText:
      routeEstimate?.distanceText ??
      row.distance_text ??
      (distanceMeters !== null && Number.isFinite(distanceMeters)
        ? metersToKmText(Number(distanceMeters))
        : "Distance unavailable"),
    driverSaturation:
      row.driver_saturation ??
      normaliseDriverSaturation(driversInZone, driversNeeded),
    mlConfidence: Number(row.ml_confidence ?? 0),
    predictionMode: row.prediction_mode ?? "conservative-fallback",
    isHighConfidence: Boolean(row.is_high_confidence),
    operatingConfidenceThreshold: Number(row.operating_confidence_threshold ?? 0.96),
    operatingAccuracyTarget: Number(row.operating_accuracy_target ?? 0.98),
    fallbackReason: row.fallback_reason ?? null,
    routingDecision,
    canNavigate: !isCovered && routingDecision === "go",
    isSuppressed: isCovered || routingDecision === "avoid",
    driversNeeded,
    driversInZone,
    insightText:
      normaliseDisplayText(row.insight_text) ??
      "Strong rider activity is expected in this area over the next hour.",
    activeTimeStart: row.active_time_start,
    activeTimeEnd: row.active_time_end,
    timeRange: formatWindow(row.active_time_start, row.active_time_end),
    imageUrl: realEventImageUrl(row.event_raw_data),
    city: row.city ?? null,
    country: row.country ?? null,
    source: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    venueName: row.venue_name ?? row.name,
    estimatedEndTime: Boolean(row.estimated_end_time),
    minutesUntilEnd,
    effectiveDistanceMeters: distanceMeters !== null && Number.isFinite(distanceMeters)
      ? Math.round(Number(distanceMeters))
      : null,
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
    isCovered
  };
}

async function mapHotspotsWithRouteEstimates(
  rows: HotspotRow[],
  origin: { lat: number; lng: number }
) {
  const diagnostics = {
    googleRoutes: 0,
    estimated: 0
  };

  const hotspots = await Promise.all(
    rows.map(async (row) => {
      const routeEstimate = await getRouteEstimate({
        originLat: origin.lat,
        originLng: origin.lng,
        destinationLat: Number(row.lat),
        destinationLng: Number(row.lng),
        country: row.country
      });

      diagnostics[routeEstimate.provider === "google-routes" ? "googleRoutes" : "estimated"] += 1;
      return mapHotspot(row, routeEstimate);
    })
  );

  return { hotspots, diagnostics };
}

function buildDemandByHour(liveScore: number) {
  const hours = [
    "9AM",
    "10AM",
    "11AM",
    "12PM",
    "1PM",
    "2PM",
    "3PM",
    "4PM",
    "5PM",
    "6PM",
    "7PM",
    "NOW",
    "1AM",
    "2AM"
  ];
  const base = [20, 24, 28, 34, 42, 50, 58, 66, 74, 81, 85, liveScore, 65, 40];
  const values = base.map((value, index) => (index === 11 ? liveScore : Math.min(liveScore, value)));

  return {
    hours,
    values,
    currentHourIndex: 11,
    timeRange: "7 PM — 2 AM"
  };
}

async function queryLiveHotspotRows(input: {
  delayedForFreePlan: boolean;
  lat: number;
  lng: number;
  radius: number;
  limit: number;
}) {
  if (input.delayedForFreePlan) {
    return query<HotspotRow>(
      `WITH latest_delayed_snapshots AS (
         SELECT DISTINCT ON (s.hotspot_id)
           s.hotspot_id AS id,
           s.name,
           s.postcode,
           s.demand_level,
           s.demand_score,
           s.live_score,
           s.drivers_needed,
           s.drive_time_text,
           s.distance_text,
           s.driver_saturation,
           s.ml_confidence,
           s.prediction_mode,
           s.is_high_confidence,
           s.operating_confidence_threshold,
           s.operating_accuracy_target,
           s.fallback_reason,
           s.routing_decision,
           s.insight_text,
           s.active_time_start,
           s.active_time_end,
           s.generated_at,
           NULL::timestamptz AS expires_at,
           s.event_id,
           s.location
         FROM hotspot_snapshots s
         JOIN events e ON e.id = s.event_id
         WHERE s.generated_at <= NOW() - INTERVAL '30 minutes'
           AND s.generated_at >= NOW() - INTERVAL '24 hours'
           AND s.active_time_start <= NOW()
           AND s.active_time_end IS NOT NULL
           AND s.active_time_end BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
           AND e.source = ANY($5::text[])
           AND ST_DWithin(s.location, ${geographyPointSql("$2", "$1")}, $3)
         ORDER BY s.hotspot_id, s.generated_at DESC
       ),
       ranked AS (
         SELECT
           s.*,
           e.city,
           e.country,
           e.source,
           e.source_url,
           e.venue_name,
           e.estimated_end_time,
           e.raw_data AS event_raw_data,
           ${selectLatLng("s.location")},
           ST_Distance(s.location, ${geographyPointSql("$2", "$1")}) AS distance_meters,
           EXTRACT(EPOCH FROM (s.active_time_end - NOW())) / 60 AS minutes_until_end,
           (
             SELECT COUNT(*)
             FROM driver_coverage dc
             WHERE dc.hotspot_id = s.id
           ) AS drivers_in_zone
         FROM latest_delayed_snapshots s
         JOIN events e ON e.id = s.event_id
       )
       SELECT *
       FROM ranked
       ORDER BY demand_score DESC, distance_meters ASC, active_time_end ASC
       LIMIT $4`,
      [input.lat, input.lng, input.radius, input.limit, REAL_HOTSPOT_EVENT_SOURCES]
    );
  }

  return query<HotspotRow>(
    `SELECT
       h.*,
       e.city,
       e.country,
       e.source,
       e.source_url,
       e.venue_name,
       e.estimated_end_time,
       e.raw_data AS event_raw_data,
       ${selectLatLng("h.location")},
       ST_Distance(h.location, ${geographyPointSql("$2", "$1")}) AS distance_meters,
       EXTRACT(EPOCH FROM (h.active_time_end - NOW())) / 60 AS minutes_until_end,
       (
         SELECT COUNT(*)
         FROM driver_coverage dc
         WHERE dc.hotspot_id = h.id
       ) AS drivers_in_zone
     FROM hotspots h
     JOIN events e ON e.id = h.event_id
     WHERE h.is_active = TRUE
       AND h.event_id IS NOT NULL
        AND e.source = ANY($5::text[])
       AND h.active_time_start <= NOW()
       AND h.active_time_end IS NOT NULL
       AND h.active_time_end BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
        AND ST_DWithin(h.location, ${geographyPointSql("$2", "$1")}, $3)
     ORDER BY h.demand_score DESC, distance_meters ASC, h.active_time_end ASC
     LIMIT $4`,
    [input.lat, input.lng, input.radius, input.limit, REAL_HOTSPOT_EVENT_SOURCES]
  );
}

export const hotspotService = {
  async getHotspots(options: {
    lat: number;
    lng: number;
    radius: number;
    limit: number;
    planTier: PlanTier;
  }) {
    const delayedForFreePlan = options.planTier === "free";
    const requestedRadius = Math.min(Math.max(Math.round(options.radius), 1), 50000);
    const radiusSteps = getRadiusSteps(requestedRadius);
    const queryLimit = Math.min(Math.max(options.limit, HOTSPOT_TARGET_COUNT), 20);
    let effectiveRadius = requestedRadius;
    let areaRefresh = await areaRefreshService.ensureFresh({
      lat: options.lat,
      lng: options.lng,
      radius: requestedRadius
    });
    let result = await queryLiveHotspotRows({
      delayedForFreePlan,
      lat: options.lat,
      lng: options.lng,
      radius: requestedRadius,
      limit: queryLimit
    });

    for (const radius of radiusSteps.slice(1)) {
      if (result.rows.length >= HOTSPOT_TARGET_COUNT) {
        break;
      }

      effectiveRadius = radius;
      areaRefresh = await areaRefreshService.ensureFresh({
        lat: options.lat,
        lng: options.lng,
        radius
      });
      result = await queryLiveHotspotRows({
        delayedForFreePlan,
        lat: options.lat,
        lng: options.lng,
        radius,
        limit: queryLimit
      });
    }

    const expandedRadius = effectiveRadius > requestedRadius;
    const shortfallReason =
      result.rows.length < HOTSPOT_TARGET_COUNT
        ? `Only ${result.rows.length} live events ending soon were found within ${formatRadiusKm(effectiveRadius)}.`
        : null;

    console.info(
      JSON.stringify({
        event: "hotspots_query_completed",
        planTier: options.planTier,
        freshness: delayedForFreePlan ? "delayed" : "realtime",
        count: result.rows.length,
        requestedRadiusMeters: requestedRadius,
        effectiveRadiusMeters: effectiveRadius,
        targetCount: HOTSPOT_TARGET_COUNT,
        expandedRadius,
        liveWindow: LIVE_EVENT_WINDOW,
        areaKey: areaRefresh.areaKey,
        refreshing: areaRefresh.refreshing,
        lastRefreshedAt: areaRefresh.lastRefreshedAt,
        shortfallReason
      })
    );

    const mapped = await mapHotspotsWithRouteEstimates(result.rows, {
      lat: options.lat,
      lng: options.lng
    });

    return {
      hotspots: mapped.hotspots,
      total: result.rows.length,
      generatedAt: result.rows[0]?.generated_at ?? new Date().toISOString(),
      freshness: delayedForFreePlan ? "delayed" : "realtime",
      refreshing: areaRefresh.refreshing,
      lastRefreshedAt: areaRefresh.lastRefreshedAt,
      requestedRadiusMeters: requestedRadius,
      effectiveRadiusMeters: effectiveRadius,
      targetCount: HOTSPOT_TARGET_COUNT,
      returnedCount: result.rows.length,
      expandedRadius,
      liveWindow: LIVE_EVENT_WINDOW,
      shortfallReason,
      providerDiagnostics: {
        ...areaRefresh.providerDiagnostics,
        requestedRadiusMeters: requestedRadius,
        effectiveRadiusMeters: effectiveRadius,
        targetCount: HOTSPOT_TARGET_COUNT,
        returnedCount: result.rows.length,
        expandedRadius,
        liveWindow: LIVE_EVENT_WINDOW,
        shortfallReason,
        routeEstimates: mapped.diagnostics
      }
    };
  },

  async getHotspotById(id: string) {
    const result = await query<HotspotRow>(
      `SELECT
         h.*,
         e.city,
         e.country,
         e.source,
         e.source_url,
         e.venue_name,
         e.estimated_end_time,
         e.raw_data AS event_raw_data,
         EXTRACT(EPOCH FROM (h.active_time_end - NOW())) / 60 AS minutes_until_end,
         ${selectLatLng("h.location")}
       FROM hotspots h
       JOIN events e ON e.id = h.event_id
       WHERE h.id = $1
         AND e.source = ANY($2::text[])`,
      [id, REAL_HOTSPOT_EVENT_SOURCES]
    );

    const hotspot = result.rows[0];
    if (!hotspot) {
      throw new AppError(404, "NOT_FOUND", "Hotspot not found");
    }

    return mapHotspot(hotspot);
  },

  async getDemandByHour(id: string) {
    const hotspot = await this.getHotspotById(id);
    return { ...buildDemandByHour(hotspot.liveScore), timeRange: "7 PM - 2 AM" };
  },

  async listBroadcastHotspots(limit = 20) {
    const result = await query<HotspotRow>(
      `SELECT
         h.*,
         e.city,
         e.country,
         e.source,
         e.source_url,
         e.venue_name,
         e.estimated_end_time,
         e.raw_data AS event_raw_data,
         ${selectLatLng("h.location")},
         EXTRACT(EPOCH FROM (h.active_time_end - NOW())) / 60 AS minutes_until_end,
         (
           SELECT COUNT(*)
           FROM driver_coverage dc
           WHERE dc.hotspot_id = h.id
         ) AS drivers_in_zone
       FROM hotspots h
       JOIN events e ON e.id = h.event_id
       WHERE h.is_active = TRUE
         AND e.source = ANY($2::text[])
         AND h.active_time_start <= NOW()
         AND h.active_time_end IS NOT NULL
         AND h.active_time_end BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
       ORDER BY h.demand_score DESC, h.active_time_end ASC
       LIMIT $1`,
      [limit, REAL_HOTSPOT_EVENT_SOURCES]
    );

    return result.rows.map((row) => mapHotspot(row));
  },

  async navigate(driverId: string, hotspotId: string) {
    await query(
      `INSERT INTO prediction_feedback (driver_id, hotspot_id, acted_on, trips_completed)
       VALUES ($1, $2, TRUE, 0)`,
      [driverId, hotspotId]
    );
  }
};
