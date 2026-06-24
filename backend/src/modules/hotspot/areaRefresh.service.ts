import { query } from "../../config/database.js";
import { redis } from "../../config/redis.js";
import { eventsService } from "../events/events.service.js";
import { generateHotspotsFromEvents } from "../../services/hotspotGeneration.service.js";
import { getTrafficScore } from "../../services/hereMaps.service.js";
import { env } from "../../config/env.js";

const AREA_REFRESH_TTL_MS = env.PUBLIC_EVENT_REFRESH_TTL_SECONDS * 1000;
const AREA_REFRESH_LOCK_SECONDS = 120;

interface AreaRefreshRow {
  area_key: string;
  status: "pending" | "running" | "completed" | "failed";
  ticketmaster_events: number | string;
  eventbrite_events: number | string;
  rejected_events: number | string;
  generated_hotspots: number | string;
  ml_fallback_hotspots: number | string;
  here_traffic_available: boolean;
  completed_at: string | null;
  last_error: string | null;
  provider_diagnostics: unknown;
}

export interface AreaRefreshMetadata {
  areaKey: string;
  refreshing: boolean;
  fresh: boolean;
  lastRefreshedAt: string | null;
  providerDiagnostics: {
    status: string;
    ticketmasterEvents: number;
    eventbriteEvents: number;
    rejectedEvents: number;
    generatedHotspots: number;
    mlFallbackHotspots: number;
    hereTrafficAvailable: boolean;
    lastError: string | null;
    details: unknown;
  };
}

function areaKey(input: { lat: number; lng: number; radius: number }) {
  const gridLat = Math.round(input.lat * 20) / 20;
  const gridLng = Math.round(input.lng * 20) / 20;
  return `${gridLat.toFixed(2)}:${gridLng.toFixed(2)}:${input.radius}`;
}

function emptyMetadata(key: string, refreshing: boolean): AreaRefreshMetadata {
  return {
    areaKey: key,
    refreshing,
    fresh: false,
    lastRefreshedAt: null,
    providerDiagnostics: {
      status: refreshing ? "running" : "unknown",
      ticketmasterEvents: 0,
      eventbriteEvents: 0,
      rejectedEvents: 0,
      generatedHotspots: 0,
      mlFallbackHotspots: 0,
      hereTrafficAvailable: false,
      lastError: null,
      details: null
    }
  };
}

function metadataFromRow(key: string, row: AreaRefreshRow, refreshing: boolean): AreaRefreshMetadata {
  const completedAt = row.completed_at;
  const fresh =
    row.status === "completed" &&
    completedAt !== null &&
    Date.now() - new Date(completedAt).getTime() <= AREA_REFRESH_TTL_MS;

  return {
    areaKey: key,
    refreshing,
    fresh,
    lastRefreshedAt: completedAt,
    providerDiagnostics: {
      status: row.status,
      ticketmasterEvents: Number(row.ticketmaster_events ?? 0),
      eventbriteEvents: Number(row.eventbrite_events ?? 0),
      rejectedEvents: Number(row.rejected_events ?? 0),
      generatedHotspots: Number(row.generated_hotspots ?? 0),
      mlFallbackHotspots: Number(row.ml_fallback_hotspots ?? 0),
      hereTrafficAvailable: Boolean(row.here_traffic_available),
      lastError: row.last_error,
      details: row.provider_diagnostics
    }
  };
}

function isMissingAreaRefreshTable(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: string }).code === "42P01");
}

async function getRefreshRow(key: string) {
  try {
    const result = await query<AreaRefreshRow>(
      `SELECT area_key, status, ticketmaster_events, eventbrite_events, rejected_events,
              generated_hotspots, ml_fallback_hotspots, here_traffic_available,
              completed_at::text AS completed_at, last_error, provider_diagnostics
       FROM area_refreshes
       WHERE area_key = $1`,
      [key]
    );

    return result.rows[0] ?? null;
  } catch (error) {
    if (isMissingAreaRefreshTable(error)) {
      console.warn(
        JSON.stringify({
          event: "area_refresh_table_missing",
          message: "Run migration 010_add_area_refreshes.sql to enable area refresh diagnostics."
        })
      );
      return null;
    }

    throw error;
  }
}

async function markRefreshRunning(input: { key: string; lat: number; lng: number; radius: number }) {
  try {
    await query(
      `INSERT INTO area_refreshes (
         area_key, lat, lng, radius_meters, status, started_at, updated_at, last_error
       ) VALUES ($1, $2, $3, $4, 'running', NOW(), NOW(), NULL)
       ON CONFLICT (area_key) DO UPDATE SET
         lat = EXCLUDED.lat,
         lng = EXCLUDED.lng,
         radius_meters = EXCLUDED.radius_meters,
         status = 'running',
         started_at = NOW(),
         updated_at = NOW(),
         last_error = NULL`,
      [input.key, input.lat, input.lng, input.radius]
    );
  } catch (error) {
    if (!isMissingAreaRefreshTable(error)) {
      throw error;
    }
  }
}

async function markRefreshCompleted(input: {
  key: string;
  ingested: Awaited<ReturnType<typeof eventsService.ingestEventsNear>>;
  activeEvents: number;
  generatedHotspots: number;
  mlFallbackHotspots: number;
  hereTrafficAvailable: boolean;
}) {
  try {
    await query(
      `UPDATE area_refreshes
       SET status = 'completed',
           ticketmaster_events = $2,
           eventbrite_events = $3,
           rejected_events = $8,
           generated_hotspots = $4,
           ml_fallback_hotspots = $5,
           here_traffic_available = $6,
           completed_at = NOW(),
           updated_at = NOW(),
          provider_diagnostics = $7::jsonb,
           last_error = NULL
       WHERE area_key = $1`,
      [
        input.key,
        input.ingested.ticketmasterEvents,
        input.ingested.eventbriteEvents,
        input.generatedHotspots,
        input.mlFallbackHotspots,
        input.hereTrafficAvailable,
        JSON.stringify({
          totalProviderEvents: input.ingested.total,
          googlePlaceEvents: input.ingested.googlePlaceEvents,
          activeEventsInWindow: input.activeEvents,
          errors: input.ingested.errors,
          eventbriteGeocodedEvents: input.ingested.eventbriteGeocodedEvents,
          eventbrite: input.ingested.eventbriteDiagnostics
        }),
        input.ingested.eventbriteRejectedEvents
      ]
    );
  } catch (error) {
    if (!isMissingAreaRefreshTable(error)) {
      throw error;
    }
  }
}

async function markRefreshFailed(key: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  try {
    await query(
      `UPDATE area_refreshes
       SET status = 'failed',
           last_error = $2,
           updated_at = NOW(),
           provider_diagnostics = jsonb_set(
             COALESCE(provider_diagnostics, '{}'::jsonb),
             '{failure}',
             to_jsonb($2::text),
             true
           )
       WHERE area_key = $1`,
      [key, message]
    );
  } catch (updateError) {
    if (!isMissingAreaRefreshTable(updateError)) {
      throw updateError;
    }
  }
}

async function refreshArea(input: { key: string; lat: number; lng: number; radius: number }) {
  await markRefreshRunning(input);

  try {
    const [ingested, areaTrafficScore] = await Promise.all([
      eventsService.ingestEventsNear({
        lat: input.lat,
        lng: input.lng,
        radius: input.radius
      }),
      getTrafficScore(input.lat, input.lng)
    ]);

    const activeEvents = await eventsService.getActiveEventsNear({
      lat: input.lat,
      lng: input.lng,
      radius: input.radius
    });
    const hotspots = await generateHotspotsFromEvents(activeEvents);
    const mlFallbackHotspots = hotspots.filter(
      (hotspot) => hotspot.predictionMode === "conservative-fallback"
    ).length;

    await markRefreshCompleted({
      key: input.key,
      ingested,
      activeEvents: activeEvents.length,
      generatedHotspots: hotspots.length,
      mlFallbackHotspots,
      hereTrafficAvailable: areaTrafficScore !== null
    });

    console.info(
      JSON.stringify({
        event: "area_refresh_completed",
        areaKey: input.key,
        providerEvents: ingested.total,
        activeEvents: activeEvents.length,
        generatedHotspots: hotspots.length,
        mlFallbackHotspots,
        hereTrafficAvailable: areaTrafficScore !== null
      })
    );
  } catch (error) {
    await markRefreshFailed(input.key, error);
    console.error(
      JSON.stringify({
        event: "area_refresh_failed",
        areaKey: input.key,
        message: error instanceof Error ? error.message : String(error)
      })
    );
  }
}

export const areaRefreshService = {
  async ensureFresh(input: { lat: number; lng: number; radius: number }) {
    const key = areaKey(input);
    const current = await getRefreshRow(key);

    if (current) {
      const metadata = metadataFromRow(key, current, current.status === "running");
      if (metadata.fresh || metadata.refreshing) {
        return metadata;
      }
    }

    const lockKey = `area-refresh:${key}`;
    const lockAcquired = await redis.set(lockKey, "1", "EX", AREA_REFRESH_LOCK_SECONDS, "NX");
    if (lockAcquired !== "OK") {
      return current ? metadataFromRow(key, current, true) : emptyMetadata(key, true);
    }

    void refreshArea({ key, ...input }).finally(() => {
      void redis.del(lockKey).catch(() => undefined);
    });

    return current ? metadataFromRow(key, current, true) : emptyMetadata(key, true);
  },

  async getMetadata(input: { lat: number; lng: number; radius: number }) {
    const key = areaKey(input);
    const current = await getRefreshRow(key);
    return current ? metadataFromRow(key, current, current.status === "running") : emptyMetadata(key, false);
  }
};
