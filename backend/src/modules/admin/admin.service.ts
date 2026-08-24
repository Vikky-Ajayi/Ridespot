import bcrypt from "bcrypt";
import { query, withTransaction } from "../../config/database.js";
import { redis } from "../../config/redis.js";
import { getModelHealth, triggerModelRetrain } from "../../services/ml.service.js";
import { getIntegrationStatuses } from "../../services/integrationHealth.service.js";
import { assertMarketCountry } from "../../utils/country.js";
import { geographyPointSql, getHotspotsWithCoverage, selectLatLng } from "../../utils/geospatial.js";
import { AppError } from "../../utils/http.js";
import { eventsService } from "../events/events.service.js";
import type { AdminRole } from "../../utils/adminJwt.js";
import { eventQueue } from "../../jobs/eventIngestion.job.js";
import { hotspotQueue } from "../../jobs/hotspotRefresh.job.js";
import { restaurantQueue } from "../../jobs/restaurantClusterRefresh.job.js";
import { eventbriteSitemapQueue } from "../../jobs/eventbriteSitemapCrawl.job.js";
import type { triggerJobSchema } from "./admin.schema.js";
import type { z } from "zod";
import { EVENT_INGESTION_TILES } from "../../data/eventIngestionTiles.js";

interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  role: AdminRole;
}

interface MarketConfigRow {
  id: string;
  city: string;
  country: string;
  notification_radius_meters: number;
  driver_per_attendee_ratio: number;
  min_drivers_per_zone: number;
  alert_radius_meters: number;
  is_active: boolean;
  updated_at: string;
}

function marketConfigCacheKey(city: string) {
  return `market-config:${city.toLowerCase()}`;
}

function mapMarketConfig(row: MarketConfigRow) {
  return {
    id: row.id,
    city: row.city,
    country: row.country,
    notificationRadiusMeters: row.notification_radius_meters,
    driverPerAttendeeRatio: row.driver_per_attendee_ratio,
    minDriversPerZone: row.min_drivers_per_zone,
    alertRadiusMeters: row.alert_radius_meters,
    isActive: row.is_active,
    updatedAt: row.updated_at
  };
}

export async function getCachedMarketConfig(city: string) {
  const cacheKey = marketConfigCacheKey(city);
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached) as ReturnType<typeof mapMarketConfig>;
  }

  const result = await query<MarketConfigRow>(
    `SELECT id, city, country, notification_radius_meters, driver_per_attendee_ratio,
            min_drivers_per_zone, alert_radius_meters, is_active, updated_at
     FROM market_config
     WHERE city = $1
       AND is_active = TRUE`,
    [city]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const mapped = mapMarketConfig(row);
  await redis.setex(cacheKey, 300, JSON.stringify(mapped));
  return mapped;
}

export const adminService = {
  async login(input: { email: string; password: string }) {
    const result = await query<AdminRow>(
      `SELECT id, email, password_hash, name, role
       FROM admins
       WHERE email = $1`,
      [input.email.toLowerCase()]
    );

    const admin = result.rows[0];
    if (!admin) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const matches = await bcrypt.compare(input.password, admin.password_hash);
    if (!matches) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      adminRole: admin.role
    };
  },

  async getMarketConfigs() {
    const result = await query<MarketConfigRow>(
      `SELECT id, city, country, notification_radius_meters, driver_per_attendee_ratio,
              min_drivers_per_zone, alert_radius_meters, is_active, updated_at
       FROM market_config
       ORDER BY city ASC`
    );

    return result.rows.map(mapMarketConfig);
  },

  async updateMarketConfig(
    city: string,
    input: {
      notificationRadiusMeters: number;
      driverPerAttendeeRatio: number;
      minDriversPerZone: number;
      alertRadiusMeters: number;
    },
    updatedBy: string
  ) {
    const result = await query<MarketConfigRow>(
      `UPDATE market_config
       SET notification_radius_meters = $2,
           driver_per_attendee_ratio = $3,
           min_drivers_per_zone = $4,
           alert_radius_meters = $5,
           updated_by = $6,
           updated_at = NOW()
       WHERE city = $1
       RETURNING id, city, country, notification_radius_meters, driver_per_attendee_ratio,
                 min_drivers_per_zone, alert_radius_meters, is_active, updated_at`,
      [
        city,
        input.notificationRadiusMeters,
        input.driverPerAttendeeRatio,
        input.minDriversPerZone,
        input.alertRadiusMeters,
        updatedBy
      ]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Market config not found");
    }

    await redis.del(marketConfigCacheKey(city));
    return mapMarketConfig(row);
  },

  async getOnlineDrivers() {
    const result = await query<{
      id: string;
      full_name: string;
      plan_tier: string;
      lat: number;
      lng: number;
      last_seen: string;
      zones_in: string[] | null;
    }>(
      `SELECT
         d.id,
         d.full_name,
         d.plan_tier,
         ST_Y(dl.location::geometry) AS lat,
         ST_X(dl.location::geometry) AS lng,
         dl.last_seen,
         COALESCE(ARRAY_REMOVE(ARRAY_AGG(dc.hotspot_id), NULL), '{}') AS zones_in
       FROM drivers d
       JOIN driver_locations dl ON dl.driver_id = d.id
       LEFT JOIN driver_coverage dc ON dc.driver_id = d.id
       WHERE dl.is_online = TRUE
         AND dl.last_seen > NOW() - INTERVAL '5 minutes'
       GROUP BY d.id, d.full_name, d.plan_tier, dl.location, dl.last_seen
       ORDER BY dl.last_seen DESC`
    );

    return result.rows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      planTier: row.plan_tier,
      location: {
        lat: Number(row.lat),
        lng: Number(row.lng)
      },
      lastSeen: row.last_seen,
      zonesIn: row.zones_in ?? []
    }));
  },

  async getActiveHotspots() {
    return getHotspotsWithCoverage();
  },

  async getHotspotDiagnostics() {
    const [
      eventsTotal,
      activeEventsWindow,
      currentHotspotsTotal,
      activeRealtimeHotspots,
      snapshotsTotal,
      delayedSnapshotsEligible,
      lastCurrentHotspot,
      lastSnapshot,
      areaRefreshTotal,
      latestAreaRefresh
    ] = await Promise.all([
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM events WHERE is_active = TRUE`),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM events
         WHERE is_active = TRUE
           AND start_time <= NOW() + INTERVAL '3 hours'
           AND COALESCE(end_time, start_time + INTERVAL '3 hours') >= NOW()`
      ),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM hotspots WHERE is_active = TRUE`),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM hotspots
         WHERE is_active = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())`
      ),
      query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM hotspot_snapshots`),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM (
           SELECT DISTINCT ON (hotspot_id) hotspot_id
           FROM hotspot_snapshots
           WHERE generated_at <= NOW() - INTERVAL '30 minutes'
             AND generated_at >= NOW() - INTERVAL '24 hours'
             AND (active_time_end IS NULL OR active_time_end >= NOW())
           ORDER BY hotspot_id, generated_at DESC
         ) delayed`
      ),
      query<{ generated_at: string | null }>(
        `SELECT MAX(generated_at)::text AS generated_at FROM hotspots`
      ),
      query<{ generated_at: string | null }>(
        `SELECT MAX(generated_at)::text AS generated_at FROM hotspot_snapshots`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM area_refreshes`
      ),
      query<{
        area_key: string;
        status: string;
        completed_at: string | null;
        ticketmaster_events: string | number;
        eventbrite_events: string | number;
        generated_hotspots: string | number;
        ml_fallback_hotspots: string | number;
        here_traffic_available: boolean;
        last_error: string | null;
      }>(
        `SELECT area_key, status, completed_at::text AS completed_at,
                ticketmaster_events, eventbrite_events, generated_hotspots,
                ml_fallback_hotspots, here_traffic_available, last_error
         FROM area_refreshes
         ORDER BY updated_at DESC
         LIMIT 1`
      )
    ]);

    const delayedEligibleCount = Number(delayedSnapshotsEligible.rows[0]?.count ?? 0);

    return {
      events: {
        activeTotal: Number(eventsTotal.rows[0]?.count ?? 0),
        activeInRefreshWindow: Number(activeEventsWindow.rows[0]?.count ?? 0)
      },
      hotspots: {
        currentTotal: Number(currentHotspotsTotal.rows[0]?.count ?? 0),
        activeRealtime: Number(activeRealtimeHotspots.rows[0]?.count ?? 0),
        snapshotsTotal: Number(snapshotsTotal.rows[0]?.count ?? 0),
        delayedSnapshotsEligible: delayedEligibleCount,
        freePlanCanReturnSuggestions: delayedEligibleCount > 0,
        lastCurrentGeneratedAt: lastCurrentHotspot.rows[0]?.generated_at ?? null,
        lastSnapshotGeneratedAt: lastSnapshot.rows[0]?.generated_at ?? null
      },
      areaRefreshes: {
        total: Number(areaRefreshTotal.rows[0]?.count ?? 0),
        latest: latestAreaRefresh.rows[0]
          ? {
              areaKey: latestAreaRefresh.rows[0].area_key,
              status: latestAreaRefresh.rows[0].status,
              completedAt: latestAreaRefresh.rows[0].completed_at,
              ticketmasterEvents: Number(latestAreaRefresh.rows[0].ticketmaster_events ?? 0),
              eventbriteEvents: Number(latestAreaRefresh.rows[0].eventbrite_events ?? 0),
              generatedHotspots: Number(latestAreaRefresh.rows[0].generated_hotspots ?? 0),
              mlFallbackHotspots: Number(latestAreaRefresh.rows[0].ml_fallback_hotspots ?? 0),
              hereTrafficAvailable: Boolean(latestAreaRefresh.rows[0].here_traffic_available),
              lastError: latestAreaRefresh.rows[0].last_error
            }
          : null
      },
      railway: {
        apiStartCommand: "npm --prefix backend run start",
        workerStartCommand: "npm --prefix backend run start:worker"
      }
    };
  },

  async getIntegrationStatus() {
    return getIntegrationStatuses();
  },

  async getEventPipelineDiagnostics() {
    return eventsService.getPipelineDiagnostics();
  },

  async getNotificationLogs(limit: number) {
    const result = await query<{
      id: string;
      type: string;
      title: string | null;
      body: string | null;
      was_delivered: boolean;
      was_acted_on: boolean;
      sent_at: string;
      driver_name: string | null;
      hotspot_name: string | null;
    }>(
      `SELECT
         nl.id,
         nl.type,
         nl.title,
         nl.body,
         nl.was_delivered,
         nl.was_acted_on,
         nl.sent_at,
         d.full_name AS driver_name,
         h.name AS hotspot_name
       FROM notification_logs nl
       LEFT JOIN drivers d ON d.id = nl.driver_id
       LEFT JOIN hotspots h ON h.id = nl.hotspot_id
       ORDER BY nl.sent_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      wasDelivered: row.was_delivered,
      wasActedOn: row.was_acted_on,
      sentAt: row.sent_at,
      driverName: row.driver_name,
      hotspotName: row.hotspot_name
    }));
  },

  async getMlStatus() {
    return getModelHealth();
  },

  async triggerMlRetrain() {
    return triggerModelRetrain();
  },

  async listEvents(limit: number) {
    const result = await query<{
      id: string;
      source: string;
      name: string;
      venue_name: string | null;
      address: string | null;
      city: string | null;
      country: string | null;
      start_time: string;
      end_time: string | null;
      expected_attendance: number | null;
      event_type: string | null;
      event_category: string | null;
      lat: number;
      lng: number;
      is_active: boolean;
    }>(
      `SELECT
         id,
         source,
         name,
         venue_name,
         address,
         city,
         country,
         start_time,
         end_time,
         expected_attendance,
         event_type,
         event_category,
         ${selectLatLng("location")},
         is_active
       FROM events
       WHERE is_active = TRUE
       ORDER BY start_time DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      source: row.source,
      name: row.name,
      venueName: row.venue_name,
      address: row.address,
      city: row.city,
      country: row.country,
      startTime: row.start_time,
      endTime: row.end_time,
      expectedAttendance: row.expected_attendance,
      eventType: row.event_type,
      eventCategory: row.event_category,
      location: {
        lat: Number(row.lat),
        lng: Number(row.lng)
      },
      isActive: row.is_active
    }));
  },

  async createEvent(input: {
    name: string;
    venueName?: string | null;
    lat: number;
    lng: number;
    address?: string | null;
    city: string;
    country: string;
    startTime: string;
    endTime?: string | null;
    expectedAttendance?: number | null;
    eventType?: string | null;
    eventCategory?: string | null;
  }) {
    const result = await query<{ id: string }>(
      `INSERT INTO events (
         external_id, source, name, venue_name, location, address, city, country,
         start_time, end_time, expected_attendance, event_type, event_category, raw_data, is_active
       ) VALUES (
         $1, 'manual', $2, $3, ${geographyPointSql("$5", "$4")}, $6, $7, $8,
         $9, $10, $11, $12, $13, '{}'::jsonb, TRUE
       )
       RETURNING id`,
      [
        `manual-${Date.now()}`,
        input.name,
        input.venueName ?? null,
        input.lat,
        input.lng,
        input.address ?? null,
        input.city,
        assertMarketCountry(input.country),
        input.startTime,
        input.endTime ?? null,
        input.expectedAttendance ?? null,
        input.eventType ?? null,
        input.eventCategory ?? null
      ]
    );

    return { id: result.rows[0]?.id };
  },

  async updateEvent(
    id: string,
    input: {
      name: string;
      venueName?: string | null;
      lat: number;
      lng: number;
      address?: string | null;
      city: string;
      country: string;
      startTime: string;
      endTime?: string | null;
      expectedAttendance?: number | null;
      eventType?: string | null;
      eventCategory?: string | null;
    }
  ) {
    const result = await query<{ id: string }>(
      `UPDATE events
       SET name = $2,
           venue_name = $3,
           location = ${geographyPointSql("$5", "$4")},
           address = $6,
           city = $7,
           country = $8,
           start_time = $9,
           end_time = $10,
           expected_attendance = $11,
           event_type = $12,
           event_category = $13,
           is_active = TRUE
       WHERE id = $1
       RETURNING id`,
      [
        id,
        input.name,
        input.venueName ?? null,
        input.lat,
        input.lng,
        input.address ?? null,
        input.city,
        assertMarketCountry(input.country),
        input.startTime,
        input.endTime ?? null,
        input.expectedAttendance ?? null,
        input.eventType ?? null,
        input.eventCategory ?? null
      ]
    );

    if (!result.rows[0]) {
      throw new AppError(404, "NOT_FOUND", "Event not found");
    }

    return { id: result.rows[0].id };
  },

  async deleteEvent(id: string) {
    const result = await query<{ id: string }>(
      `UPDATE events
       SET is_active = FALSE
       WHERE id = $1
       RETURNING id`,
      [id]
    );

    if (!result.rows[0]) {
      throw new AppError(404, "NOT_FOUND", "Event not found");
    }

    return { id };
  },

  // Enqueues a one-off run of a scheduled job onto the same BullMQ queue the worker already
  // listens on (see backend/src/jobs/*.job.ts) -- the running worker picks it up immediately,
  // no separate trigger mechanism needed. Exists so a fresh deploy doesn't have to sit and
  // wait for the next natural cron tick (up to 15 min for events, up to a week for the
  // Monday-only restaurant-location refresh) just to see whether the pipeline works at all.
  async triggerJob(job: z.infer<typeof triggerJobSchema>["job"]) {
    switch (job) {
      case "event-ingestion":
        await eventQueue.add("market-area-discovery", {});
        break;
      case "hotspot-refresh":
        await hotspotQueue.add("refresh", {});
        break;
      case "restaurant-location-refresh":
        await restaurantQueue.add("restaurant-location-refresh", {});
        break;
      case "restaurant-score-refresh":
        await restaurantQueue.add("restaurant-score-refresh", {});
        break;
      case "sitemap-index-refresh":
        await eventbriteSitemapQueue.add("sitemap-url-refresh", {});
        break;
      case "sitemap-crawl-batch":
        await eventbriteSitemapQueue.add("sitemap-page-crawl", {});
        break;
    }

    return { queued: job };
  },

  // HTTP-triggered equivalent of scripts/seed-event-ingestion-tiles.mjs -- lets the coverage
  // grid be seeded without CLI/DATABASE_URL access, using the same tile data (see
  // backend/src/data/eventIngestionTiles.ts).
  async seedEventIngestionTiles() {
    let inserted = 0;
    let updated = 0;

    await withTransaction(async (client) => {
      for (const tile of EVENT_INGESTION_TILES) {
        const tileKey = `${tile.countryCode.toLowerCase()}-${tile.label
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")}`;

        const result = await client.query<{ inserted: boolean }>(
          `INSERT INTO event_ingestion_tiles (tile_key, label, country, country_code, lat, lng, radius_meters, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
           ON CONFLICT (tile_key) DO UPDATE SET
             label = EXCLUDED.label,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             radius_meters = EXCLUDED.radius_meters,
             is_active = TRUE
           RETURNING (xmax = 0) AS inserted`,
          [tileKey, tile.label, tile.country, tile.countryCode, tile.lat, tile.lng, tile.radiusMeters]
        );

        if (result.rows[0]?.inserted) {
          inserted += 1;
        } else {
          updated += 1;
        }
      }
    });

    return { totalTiles: EVENT_INGESTION_TILES.length, inserted, updated };
  }
};
