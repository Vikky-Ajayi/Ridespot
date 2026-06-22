import { query } from "../../config/database.js";
import { computeGoogleDrivingRoute } from "../../services/googleRoutes.service.js";
import {
  geographyPointSql,
  metersToKmText,
  selectLatLng
} from "../../utils/geospatial.js";
import { AppError } from "../../utils/http.js";
import { encodePolyline, type LatLng } from "../../utils/polyline.js";
import { hotspotService } from "../hotspot/hotspot.service.js";

interface HotspotRouteRow {
  id: string;
  lat: number;
  lng: number;
  drive_time_text: string | null;
  distance_text: string | null;
}

interface NavigationSessionRow {
  id: string;
  driver_id: string;
  hotspot_id: string;
  origin_lat: number;
  origin_lng: number;
  destination_lat: number;
  destination_lng: number;
  encoded_polyline: string;
  distance_meters: number;
  distance_text: string;
  duration_seconds: number;
  duration_text: string;
  arrival_time: string;
  provider: "google-routes" | "fallback";
  fallback_used: boolean;
  status: "active" | "completed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
}

function durationText(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function parseDurationText(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  const hourMatch = normalized.match(/(\d+)\s*h/);
  const minuteMatch = normalized.match(/(\d+)\s*m/);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = hours * 3600 + minutes * 60;

  return total > 0 ? total : null;
}

function haversineDistanceMeters(origin: LatLng, destination: LatLng) {
  const earthRadiusMeters = 6371000;
  const originLat = (origin.lat * Math.PI) / 180;
  const destinationLat = (destination.lat * Math.PI) / 180;
  const deltaLat = ((destination.lat - origin.lat) * Math.PI) / 180;
  const deltaLng = ((destination.lng - origin.lng) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(originLat) * Math.cos(destinationLat) * Math.sin(deltaLng / 2) ** 2;

  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function buildFallbackRoute(origin: LatLng, destination: LatLng, hotspot: HotspotRouteRow) {
  const distanceMeters = haversineDistanceMeters(origin, destination);
  const estimatedDuration =
    parseDurationText(hotspot.drive_time_text) ??
    Math.max(60, Math.round((distanceMeters / 30000) * 3600));

  return {
    encodedPolyline: encodePolyline([origin, destination]),
    distanceMeters,
    durationSeconds: estimatedDuration,
    rawResponse: {
      fallback: true,
      reason: "Google Routes unavailable",
      sourceDriveTimeText: hotspot.drive_time_text
    }
  };
}

function arrivalIso(durationSeconds: number) {
  return new Date(Date.now() + durationSeconds * 1000).toISOString();
}

function mapNavigationSession(row: NavigationSessionRow) {
  return {
    id: row.id,
    hotspotId: row.hotspot_id,
    status: row.status,
    origin: {
      lat: Number(row.origin_lat),
      lng: Number(row.origin_lng)
    },
    destination: {
      lat: Number(row.destination_lat),
      lng: Number(row.destination_lng)
    },
    encodedPolyline: row.encoded_polyline,
    distanceMeters: Number(row.distance_meters),
    distanceText: row.distance_text,
    durationSeconds: Number(row.duration_seconds),
    durationText: row.duration_text,
    arrivalTime: row.arrival_time,
    provider: row.provider,
    fallbackUsed: row.fallback_used,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at
  };
}

async function getHotspotForRoute(hotspotId: string) {
  const result = await query<HotspotRouteRow>(
    `SELECT id, drive_time_text, distance_text, ${selectLatLng("location")}
     FROM hotspots
     WHERE id = $1
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())`,
    [hotspotId]
  );

  const hotspot = result.rows[0];
  if (!hotspot) {
    throw new AppError(404, "NOT_FOUND", "Hotspot not found");
  }

  return hotspot;
}

async function getSessionById(driverId: string, sessionId: string) {
  const result = await query<NavigationSessionRow>(
    `SELECT
       ns.*,
       ST_Y(ns.origin::geometry) AS origin_lat,
       ST_X(ns.origin::geometry) AS origin_lng,
       ST_Y(ns.destination::geometry) AS destination_lat,
       ST_X(ns.destination::geometry) AS destination_lng
     FROM navigation_sessions ns
     WHERE ns.id = $1 AND ns.driver_id = $2`,
    [sessionId, driverId]
  );

  const session = result.rows[0];
  if (!session) {
    throw new AppError(404, "NOT_FOUND", "Navigation session not found");
  }

  return session;
}

export const navigationService = {
  async start(driverId: string, input: { hotspotId: string; origin: LatLng }) {
    const hotspot = await getHotspotForRoute(input.hotspotId);
    const destination = {
      lat: Number(hotspot.lat),
      lng: Number(hotspot.lng)
    };

    const googleRoute = await computeGoogleDrivingRoute(input.origin, destination);
    const fallbackRoute = googleRoute ? null : buildFallbackRoute(input.origin, destination, hotspot);
    const route = googleRoute ?? fallbackRoute!;
    const fallbackUsed = !googleRoute;
    const provider = fallbackUsed ? "fallback" : "google-routes";
    const nextArrival = arrivalIso(route.durationSeconds);

    await query(
      `UPDATE navigation_sessions
       SET status = 'cancelled',
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE driver_id = $1 AND status = 'active'`,
      [driverId]
    );

    await hotspotService.navigate(driverId, input.hotspotId);

    const result = await query<NavigationSessionRow>(
      `INSERT INTO navigation_sessions (
         driver_id,
         hotspot_id,
         origin,
         destination,
         encoded_polyline,
         distance_meters,
         distance_text,
         duration_seconds,
         duration_text,
         arrival_time,
         provider,
         fallback_used,
         raw_provider_response
       )
       VALUES (
         $1,
         $2,
         ${geographyPointSql("$4", "$3")},
         ${geographyPointSql("$6", "$5")},
         $7,
         $8,
         $9,
         $10,
         $11,
         $12,
         $13,
         $14,
         $15
       )
       RETURNING
         *,
         ST_Y(origin::geometry) AS origin_lat,
         ST_X(origin::geometry) AS origin_lng,
         ST_Y(destination::geometry) AS destination_lat,
         ST_X(destination::geometry) AS destination_lng`,
      [
        driverId,
        input.hotspotId,
        input.origin.lat,
        input.origin.lng,
        destination.lat,
        destination.lng,
        route.encodedPolyline,
        route.distanceMeters,
        metersToKmText(route.distanceMeters),
        route.durationSeconds,
        durationText(route.durationSeconds),
        nextArrival,
        provider,
        fallbackUsed,
        JSON.stringify(route.rawResponse)
      ]
    );

    const session = result.rows[0];
    if (!session) {
      throw new AppError(500, "ROUTE_SESSION_CREATE_FAILED", "Navigation session was not created");
    }

    return mapNavigationSession(session);
  },

  async getActive(driverId: string) {
    const result = await query<NavigationSessionRow>(
      `SELECT
         ns.*,
         ST_Y(ns.origin::geometry) AS origin_lat,
         ST_X(ns.origin::geometry) AS origin_lng,
         ST_Y(ns.destination::geometry) AS destination_lat,
         ST_X(ns.destination::geometry) AS destination_lng
       FROM navigation_sessions ns
       WHERE ns.driver_id = $1 AND ns.status = 'active'
       ORDER BY ns.started_at DESC
       LIMIT 1`,
      [driverId]
    );

    return result.rows[0] ? mapNavigationSession(result.rows[0]) : null;
  },

  async cancel(driverId: string, sessionId: string) {
    await getSessionById(driverId, sessionId);
    const result = await query<NavigationSessionRow>(
      `UPDATE navigation_sessions
       SET status = 'cancelled',
           cancelled_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND driver_id = $2
       RETURNING
         *,
         ST_Y(origin::geometry) AS origin_lat,
         ST_X(origin::geometry) AS origin_lng,
         ST_Y(destination::geometry) AS destination_lat,
         ST_X(destination::geometry) AS destination_lng`,
      [sessionId, driverId]
    );

    const session = result.rows[0];
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Navigation session not found");
    }

    return mapNavigationSession(session);
  },

  async complete(driverId: string, sessionId: string) {
    await getSessionById(driverId, sessionId);
    const result = await query<NavigationSessionRow>(
      `UPDATE navigation_sessions
       SET status = 'completed',
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND driver_id = $2
       RETURNING
         *,
         ST_Y(origin::geometry) AS origin_lat,
         ST_X(origin::geometry) AS origin_lng,
         ST_Y(destination::geometry) AS destination_lat,
         ST_X(destination::geometry) AS destination_lng`,
      [sessionId, driverId]
    );

    const session = result.rows[0];
    if (!session) {
      throw new AppError(404, "NOT_FOUND", "Navigation session not found");
    }

    return mapNavigationSession(session);
  }
};
