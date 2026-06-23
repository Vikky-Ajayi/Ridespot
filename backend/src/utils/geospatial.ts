import { query } from "../config/database.js";

export interface HotspotCoverage {
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
  prediction_mode: "ml-certified" | "conservative-fallback";
  is_high_confidence: boolean;
  routing_decision: "go" | "watch" | "avoid";
  insight_text: string | null;
  active_time_start: string | null;
  active_time_end: string | null;
  drivers_in_zone: number;
  isCovered: boolean;
  coverageRatio: number;
}

export function geographyPointSql(lngPlaceholder: string, latPlaceholder: string) {
  return `ST_SetSRID(ST_MakePoint(${lngPlaceholder}, ${latPlaceholder}), 4326)::geography`;
}

export function selectLatLng(alias = "location") {
  return `ST_Y(${alias}::geometry) AS lat, ST_X(${alias}::geometry) AS lng`;
}

export function metersToKmText(distanceMeters: number) {
  return `${(distanceMeters / 1000).toFixed(1)} KM`;
}

export function normaliseDriverSaturation(driversInZone: number, requiredDrivers: number) {
  if (driversInZone >= requiredDrivers) {
    return "HIGH";
  }

  if (driversInZone >= Math.ceil(requiredDrivers / 2)) {
    return "MEDIUM";
  }

  return "LOW";
}

export async function getDriversInZone(
  hotspotId: string,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<{ count: number; drivers: string[] }> {
  void hotspotId;

  const result = await query<{ driver_id: string }>(
    `SELECT dl.driver_id
     FROM driver_locations dl
     WHERE dl.is_online = TRUE
       AND dl.last_seen > NOW() - INTERVAL '2 minutes'
       AND ST_DWithin(
         dl.location,
         ${geographyPointSql("$1", "$2")},
         $3
       )`,
    [lng, lat, radiusMeters]
  );

  return {
    count: result.rows.length,
    drivers: result.rows.map((row) => row.driver_id)
  };
}

export async function getHotspotsWithCoverage(): Promise<HotspotCoverage[]> {
  const result = await query<{
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    lat: number;
    lng: number;
    radius_meters: number;
    demand_level: "very-high" | "high" | "medium" | "low";
    demand_score: string | number;
    drivers_needed: string | number | null;
    prediction_mode: "ml-certified" | "conservative-fallback" | null;
    is_high_confidence: boolean | null;
    routing_decision: "go" | "watch" | "avoid" | null;
    insight_text: string | null;
    active_time_start: string | null;
    active_time_end: string | null;
    drivers_in_zone: string;
  }>(
    `SELECT
       h.id,
       h.name,
       e.city,
       e.country,
       ${selectLatLng("h.location")},
       h.radius_meters,
       h.demand_level,
       h.demand_score,
       COALESCE(h.drivers_needed, 1) AS drivers_needed,
       COALESCE(h.prediction_mode, 'conservative-fallback') AS prediction_mode,
       COALESCE(h.is_high_confidence, FALSE) AS is_high_confidence,
       COALESCE(h.routing_decision, 'watch') AS routing_decision,
       h.insight_text,
       h.active_time_start,
       h.active_time_end,
       COUNT(dc.driver_id)::text AS drivers_in_zone
     FROM hotspots h
     LEFT JOIN driver_coverage dc ON dc.hotspot_id = h.id
     LEFT JOIN events e ON e.id = h.event_id
     WHERE h.is_active = TRUE
       AND (h.expires_at IS NULL OR h.expires_at > NOW())
     GROUP BY
       h.id,
       h.name,
       e.city,
       e.country,
       h.location,
       h.radius_meters,
       h.demand_level,
       h.demand_score,
       h.drivers_needed,
       h.prediction_mode,
       h.is_high_confidence,
       h.routing_decision,
       h.insight_text,
       h.active_time_start,
       h.active_time_end
     ORDER BY h.demand_score DESC`
  );

  return result.rows.map((row) => {
    const driversInZone = Number(row.drivers_in_zone ?? 0);
    const driversNeeded = Math.max(1, Number(row.drivers_needed ?? 1));

    return {
      id: row.id,
      name: row.name,
      city: row.city,
      country: row.country,
      lat: Number(row.lat),
      lng: Number(row.lng),
      radius_meters: Number(row.radius_meters),
      demand_level: row.demand_level,
      demand_score: Number(row.demand_score),
      drivers_needed: driversNeeded,
      prediction_mode: row.prediction_mode ?? "conservative-fallback",
      is_high_confidence: Boolean(row.is_high_confidence),
      routing_decision: row.routing_decision ?? "watch",
      insight_text: row.insight_text,
      active_time_start: row.active_time_start,
      active_time_end: row.active_time_end,
      drivers_in_zone: driversInZone,
      isCovered: driversInZone >= driversNeeded,
      coverageRatio: driversInZone / Math.max(driversNeeded, 1)
    };
  });
}
