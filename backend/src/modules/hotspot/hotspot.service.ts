import { query } from "../../config/database.js";
import {
  geographyPointSql,
  metersToKmText,
  normaliseDriverSaturation,
  selectLatLng
} from "../../utils/geospatial.js";
import { AppError } from "../../utils/http.js";
import type { PlanTier } from "../../utils/jwt.js";

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
  event_raw_data?: unknown;
  lat: number;
  lng: number;
  distance_meters?: number;
  drivers_in_zone?: string | number;
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

function mapHotspot(row: HotspotRow) {
  const driversNeeded = Number(row.drivers_needed ?? 1);
  const driversInZone = Number(row.drivers_in_zone ?? 0);
  const isCovered = driversInZone >= driversNeeded;
  const routingDecision = normaliseRoutingDecision(row.routing_decision);

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
    driveTimeText: row.drive_time_text ?? "8 min",
    distanceText:
      row.distance_text ??
      (typeof row.distance_meters === "number" ? metersToKmText(row.distance_meters) : "5.2 KM"),
    driverSaturation:
      row.driver_saturation ??
      normaliseDriverSaturation(Number(row.drivers_in_zone ?? 0), 3),
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
    generatedAt: row.generated_at,
    expiresAt: row.expires_at,
    isCovered
  };
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

export const hotspotService = {
  async getHotspots(options: {
    lat: number;
    lng: number;
    radius: number;
    limit: number;
    planTier: PlanTier;
  }) {
    const freshnessFilter =
      options.planTier === "free" ? `AND h.generated_at < NOW() - INTERVAL '30 minutes'` : "";

    const result = await query<HotspotRow>(
      `SELECT
         h.*,
         e.city,
         e.country,
         e.raw_data AS event_raw_data,
         ${selectLatLng("h.location")},
         ST_Distance(h.location, ${geographyPointSql("$2", "$1")}) AS distance_meters,
         (
           SELECT COUNT(*)
           FROM driver_coverage dc
           WHERE dc.hotspot_id = h.id
         ) AS drivers_in_zone
       FROM hotspots h
       LEFT JOIN events e ON e.id = h.event_id
       WHERE h.is_active = TRUE
         AND (h.expires_at IS NULL OR h.expires_at > NOW())
         ${freshnessFilter}
         AND ST_DWithin(h.location, ${geographyPointSql("$2", "$1")}, $3)
       ORDER BY h.demand_score DESC
       LIMIT $4`,
      [options.lat, options.lng, options.radius, options.limit]
    );

    return {
      hotspots: result.rows.map(mapHotspot),
      total: result.rows.length,
      generatedAt: new Date().toISOString()
    };
  },

  async getHotspotById(id: string) {
    const result = await query<HotspotRow>(
      `SELECT h.*, e.city, e.country, e.raw_data AS event_raw_data, ${selectLatLng("h.location")}
       FROM hotspots h
       LEFT JOIN events e ON e.id = h.event_id
       WHERE h.id = $1`,
      [id]
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
         e.raw_data AS event_raw_data,
         ${selectLatLng("h.location")},
         (
           SELECT COUNT(*)
           FROM driver_coverage dc
           WHERE dc.hotspot_id = h.id
         ) AS drivers_in_zone
       FROM hotspots h
       LEFT JOIN events e ON e.id = h.event_id
       WHERE h.is_active = TRUE
         AND (h.expires_at IS NULL OR h.expires_at > NOW())
       ORDER BY h.demand_score DESC, h.generated_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(mapHotspot);
  },

  async navigate(driverId: string, hotspotId: string) {
    await query(
      `INSERT INTO prediction_feedback (driver_id, hotspot_id, acted_on, trips_completed)
       VALUES ($1, $2, TRUE, 0)`,
      [driverId, hotspotId]
    );
  }
};
