import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import type { EventInput } from "../../utils/normalise.js";
import { fetchPublicEventbriteEventsNear } from "../../services/eventbrite.service.js";
import type { EventSourceDiagnostic } from "../../services/eventSourceAdapter.js";
import {
  fetchTicketmasterEvents,
  fetchTicketmasterEventsNear
} from "../../services/ticketmaster.service.js";

const DEFAULT_EVENT_CITIES: Array<{
  city: string;
  country: "Nigeria" | "UK";
  countryCode: "GB" | "NG";
  lat: number;
  lng: number;
}> = [
  { city: "Lagos", country: "Nigeria", countryCode: "NG", lat: 6.5244, lng: 3.3792 },
  { city: "Abuja", country: "Nigeria", countryCode: "NG", lat: 9.0765, lng: 7.3986 },
  { city: "London", country: "UK", countryCode: "GB", lat: 51.5072, lng: -0.1276 },
  { city: "Manchester", country: "UK", countryCode: "GB", lat: 53.4808, lng: -2.2426 },
  { city: "Birmingham", country: "UK", countryCode: "GB", lat: 52.4862, lng: -1.8904 }
];

export interface ActiveEventRow {
  id: string;
  name: string;
  venue_name: string | null;
  source: "ticketmaster" | "eventbrite" | "event_aggregator" | "manual" | "google_places";
  source_url: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  expected_attendance: number | null;
  event_type: string | null;
  event_category: string | null;
  start_time: string;
  end_time: string | null;
  effective_end_time: string | null;
  estimated_end_time: boolean;
  minutes_until_end: string | number | null;
  lat: number;
  lng: number;
}

interface NearbyEventRow extends ActiveEventRow {
  hotspot_id: string | null;
  distance_meters: string | number | null;
  demand_score: string | number | null;
  demand_level: "very-high" | "high" | "medium" | "low" | null;
  drivers_needed: string | number | null;
  drivers_in_zone: string | number | null;
}

const REAL_EVENT_SOURCES = ["ticketmaster", "eventbrite", "event_aggregator", "manual"];
const EVENT_REFRESH_LOOKBACK_HOURS = 12;
const EVENT_REFRESH_LOOKAHEAD_DAYS = 7;

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatEventTimeRange(startTime: string, endTime: string | null) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
  const start = formatter.format(new Date(startTime));
  if (!endTime) {
    return start;
  }
  return `${start} - ${formatter.format(new Date(endTime))}`;
}

function formatDistance(meters: number, country: string | null | undefined) {
  if (country === "UK") {
    const miles = meters / 1609.344;
    return `${miles >= 10 ? miles.toFixed(0) : miles.toFixed(1)} mi`;
  }

  const kilometres = meters / 1000;
  return `${kilometres >= 10 ? kilometres.toFixed(0) : kilometres.toFixed(1)} KM`;
}

function estimateDriveTime(meters: number) {
  const averageUrbanMetersPerMinute = 28000 / 60;
  const minutes = Math.max(3, Math.ceil(meters / averageUrbanMetersPerMinute + 3));
  return {
    text: `${minutes} min`,
    seconds: minutes * 60
  };
}

function normaliseDemandLevel(score: number): "very-high" | "high" | "medium" | "low" {
  if (score >= 80) return "very-high";
  if (score >= 60) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function scoreUpcomingEvent(row: Pick<NearbyEventRow, "expected_attendance" | "start_time" | "demand_score">) {
  const existingScore = toNumber(row.demand_score, Number.NaN);
  if (Number.isFinite(existingScore)) {
    return clamp(existingScore, 0, 100);
  }

  const attendance = toNumber(row.expected_attendance, 500);
  const hoursUntilStart = Math.max(
    0,
    (new Date(row.start_time).getTime() - Date.now()) / (60 * 60 * 1000)
  );
  const attendanceScore = clamp(Math.log1p(attendance) * 9, 20, 72);
  const urgencyBoost = clamp(24 - hoursUntilStart, 0, 24) * 0.7;
  return clamp(attendanceScore + urgencyBoost, 15, 95);
}

function driverSaturationLabel(driversInZone: number, driversNeeded: number) {
  const ratio = driversInZone / Math.max(1, driversNeeded);
  if (ratio >= 1) return "HIGH";
  if (ratio >= 0.5) return "MEDIUM";
  return "LOW";
}

async function ensureEventHotspot(client: PoolClient, eventId: string) {
  const existing = await client.query<{ id: string }>(
    `SELECT id
     FROM hotspots
     WHERE event_id = $1
     ORDER BY generated_at DESC
     LIMIT 1`,
    [eventId]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const event = await client.query<{
    id: string;
    name: string;
    venue_name: string | null;
    city: string | null;
    country: string | null;
    expected_attendance: number | null;
    event_category: string | null;
    start_time: string;
    end_time: string | null;
    location_sql: string;
  }>(
    `SELECT
       id,
       name,
       venue_name,
       city,
       country,
       expected_attendance,
       event_category,
       start_time::text,
       end_time::text,
       ST_AsText(location::geometry) AS location_sql
     FROM events
     WHERE id = $1`,
    [eventId]
  );

  const row = event.rows[0];
  if (!row) {
    throw new Error(`Cannot create hotspot anchor for missing event ${eventId}`);
  }

  const attendance = toNumber(row.expected_attendance, 500);
  const demandScore = clamp(Math.log1p(attendance) * 9, 25, 88);
  const demandLevel = normaliseDemandLevel(demandScore);
  const driversNeeded = Math.max(2, Math.ceil(attendance / 10));
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO hotspots (
       name,
       postcode,
       location,
       radius_meters,
       demand_level,
       demand_score,
       live_score,
       driver_saturation,
       drivers_needed,
       insight_text,
       active_time_start,
       active_time_end,
       event_id,
       is_active,
       generated_at,
       expires_at
     )
     SELECT
        COALESCE($2::text, $3::text),
        concat_ws(', ', $4::text, $5::text),
        location,
        300,
        $6::text,
        $7::numeric,
        round($7::numeric)::int,
       'LOW',
       $8,
        $9::text,
       start_time,
       end_time,
       id,
       TRUE,
       NOW(),
       NULL
     FROM events
     WHERE id = $1
     RETURNING id`,
    [
      row.id,
      row.venue_name,
      row.name,
      row.city,
      row.country,
      demandLevel,
      demandScore,
      driversNeeded,
      `${row.venue_name ?? row.name} is an upcoming real event near this driver.`
    ]
  );

  const insertedHotspot = inserted.rows[0];
  if (!insertedHotspot) {
    throw new Error(`Failed to create hotspot anchor for event ${eventId}`);
  }

  return insertedHotspot.id;
}

function providerRefreshWindow(now = new Date()) {
  return {
    startTime: new Date(now.getTime() - EVENT_REFRESH_LOOKBACK_HOURS * 60 * 60 * 1000),
    endTime: new Date(now.getTime() + EVENT_REFRESH_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
  };
}

function eventDurationHours(event: Pick<EventInput, "eventType" | "eventCategory">) {
  const text = `${event.eventType ?? ""} ${event.eventCategory ?? ""}`.toLowerCase();
  if (text.includes("conference") || text.includes("business") || text.includes("education")) {
    return 8;
  }
  if (text.includes("festival")) {
    return 6;
  }
  if (text.includes("club") || text.includes("nightlife") || text.includes("party")) {
    return 4;
  }
  if (text.includes("sport") || text.includes("football") || text.includes("match")) {
    return 3;
  }
  return 3;
}

function estimateEndTime(event: EventInput) {
  return new Date(event.startTime.getTime() + eventDurationHours(event) * 60 * 60 * 1000);
}

function getSourceUrl(event: EventInput) {
  if (event.sourceUrl) {
    return event.sourceUrl;
  }

  const raw = event.rawData && typeof event.rawData === "object"
    ? (event.rawData as Record<string, unknown>)
    : {};
  const candidate = raw.url ?? raw.sourceUrl ?? raw.eventUrl;
  return typeof candidate === "string" ? candidate : null;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function prepareEventForStorage(event: EventInput): EventInput | null {
  if (!Number.isFinite(event.lat) || !Number.isFinite(event.lng)) {
    return null;
  }

  if (!isValidDate(event.startTime)) {
    return null;
  }

  const address = event.address?.trim() || null;
  const venueName = event.venueName?.trim() || address?.split(",")[0]?.trim() || null;
  if (!venueName && !address) {
    return null;
  }

  return {
    ...event,
    venueName,
    address,
    endTime: isValidDate(event.endTime) ? event.endTime : estimateEndTime(event),
    estimatedEndTime: isValidDate(event.endTime) ? Boolean(event.estimatedEndTime) : true,
    sourceUrl: getSourceUrl(event)
  };
}

async function upsertEvent(client: PoolClient, input: EventInput) {
  const event = prepareEventForStorage(input);
  if (!event) {
    return false;
  }

  await client.query(
    `INSERT INTO events (
      external_id, source, name, venue_name, location, address, city, country,
      start_time, end_time, expected_attendance, event_type, event_category,
      source_url, estimated_end_time, raw_data, is_active
     ) VALUES (
      $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17::jsonb, TRUE
     )
     ON CONFLICT (external_id, source) DO UPDATE SET
      name = EXCLUDED.name,
      venue_name = EXCLUDED.venue_name,
      location = EXCLUDED.location,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      country = EXCLUDED.country,
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      expected_attendance = EXCLUDED.expected_attendance,
      event_type = EXCLUDED.event_type,
      event_category = EXCLUDED.event_category,
      source_url = EXCLUDED.source_url,
      estimated_end_time = EXCLUDED.estimated_end_time,
      raw_data = EXCLUDED.raw_data,
      is_active = TRUE`,
    [
      event.externalId,
      event.source,
      event.name,
      event.venueName,
      event.lng,
      event.lat,
      event.address,
      event.city,
      event.country,
      event.startTime.toISOString(),
      event.endTime?.toISOString() ?? null,
      event.expectedAttendance,
      event.eventType,
      event.eventCategory,
      event.sourceUrl ?? null,
      Boolean(event.estimatedEndTime),
      JSON.stringify(event.rawData)
    ]
  );

  return true;
}

export const eventsService = {
  async ingestEvents(cities = DEFAULT_EVENT_CITIES) {
    const ingestionErrors: Array<{ city: string; source: string; message: string }> = [];
    const eventbriteDiagnostics: EventSourceDiagnostic[] = [];
    const refreshWindow = providerRefreshWindow();
    const allEvents = (
      await Promise.all(
        cities.map(async ({ city, country, countryCode, lat, lng }) => {
          const [ticketmasterEvents, eventbriteEvents] = await Promise.all([
            fetchTicketmasterEvents(city, countryCode, refreshWindow).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              ingestionErrors.push({ city, source: "ticketmaster", message });
              return [] as EventInput[];
            }),
            fetchPublicEventbriteEventsNear({
              lat,
              lng,
              radiusMeters: 15000,
              city,
              country,
              ...refreshWindow
            }).then((result) => {
              eventbriteDiagnostics.push(...result.diagnostics);
              return result.events;
            }).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              ingestionErrors.push({ city, source: "eventbrite", message });
              return [] as EventInput[];
            })
          ]);

          return [...ticketmasterEvents, ...eventbriteEvents];
        })
      )
    ).flat();

    let persistedEvents = 0;
    let rejectedBeforePersist = 0;

    await withTransaction(async (client) => {
      for (const event of allEvents) {
        if (await upsertEvent(client, event)) {
          persistedEvents += 1;
        } else {
          rejectedBeforePersist += 1;
        }
      }
    });

    return {
      total: persistedEvents,
      rejectedBeforePersist,
      errors: ingestionErrors,
      eventbriteDiagnostics
    };
  },

  async ingestEventsNear(input: { lat: number; lng: number; radius: number }) {
    const ingestionErrors: Array<{ source: string; message: string }> = [];
    let eventbriteDiagnostics: EventSourceDiagnostic[] = [];
    const refreshWindow = providerRefreshWindow();
    const [ticketmasterEvents, eventbriteEvents] = await Promise.all([
      fetchTicketmasterEventsNear({
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radius,
        ...refreshWindow
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ingestionErrors.push({ source: "ticketmaster", message });
        return [] as EventInput[];
      }),
      fetchPublicEventbriteEventsNear({
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radius,
        ...refreshWindow
      }).then((result) => {
        eventbriteDiagnostics = result.diagnostics;
        return result.events;
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ingestionErrors.push({ source: "eventbrite", message });
        return [] as EventInput[];
      })
    ]);

    const allEvents = [...ticketmasterEvents, ...eventbriteEvents];

    let persistedEvents = 0;
    let rejectedBeforePersist = 0;

    await withTransaction(async (client) => {
      for (const event of allEvents) {
        if (await upsertEvent(client, event)) {
          persistedEvents += 1;
        } else {
          rejectedBeforePersist += 1;
        }
      }
    });

    console.info(
      JSON.stringify({
        event: "area_events_ingested",
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radius,
        ticketmasterEvents: ticketmasterEvents.length,
        eventbriteEvents: eventbriteEvents.length,
        googlePlaceEvents: 0,
        totalEvents: persistedEvents,
        rejectedBeforePersist,
        errorCount: ingestionErrors.length,
        eventbriteRejectedEvents: eventbriteDiagnostics.reduce(
          (total, item) => total + item.rejected,
          0
        ),
        eventbriteGeocodedEvents: eventbriteDiagnostics.reduce(
          (total, item) => total + item.geocoded,
          0
        ),
        eventbriteDiagnostics
      })
    );

    return {
      total: persistedEvents,
      rejectedBeforePersist,
      ticketmasterEvents: ticketmasterEvents.length,
      eventbriteEvents: eventbriteEvents.length,
      googlePlaceEvents: 0,
      eventbriteRejectedEvents: eventbriteDiagnostics.reduce(
        (total, item) => total + item.rejected,
        0
      ),
      eventbriteGeocodedEvents: eventbriteDiagnostics.reduce(
        (total, item) => total + item.geocoded,
        0
      ),
      errors: ingestionErrors,
      eventbriteDiagnostics
    };
  },

  async getActiveEventsWindow() {
    const result = await query<ActiveEventRow>(
      `WITH live_events AS (
         SELECT
           e.*,
           COALESCE(
             e.end_time,
             e.start_time + CASE
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%conference%' THEN INTERVAL '8 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%business%' THEN INTERVAL '8 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%education%' THEN INTERVAL '8 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%festival%' THEN INTERVAL '6 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%club%' THEN INTERVAL '4 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%nightlife%' THEN INTERVAL '4 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%party%' THEN INTERVAL '4 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%sport%' THEN INTERVAL '3 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%football%' THEN INTERVAL '3 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%match%' THEN INTERVAL '3 hours'
               ELSE INTERVAL '3 hours'
             END
           ) AS effective_end_time,
           (e.estimated_end_time OR e.end_time IS NULL) AS effective_estimated_end_time
         FROM events e
           WHERE e.is_active = TRUE
             AND e.source = ANY($1::text[])
           AND e.start_time <= NOW()
       )
       SELECT
         id, name, venue_name, source, source_url, address, city, country, expected_attendance,
         event_type, event_category, start_time,
         effective_end_time AS end_time,
         effective_end_time,
         effective_estimated_end_time AS estimated_end_time,
         EXTRACT(EPOCH FROM (effective_end_time - NOW())) / 60 AS minutes_until_end,
         ST_Y(location::geometry) AS lat,
         ST_X(location::geometry) AS lng
       FROM live_events
       WHERE effective_end_time BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
       ORDER BY effective_end_time ASC, expected_attendance DESC NULLS LAST`,
      [REAL_EVENT_SOURCES]
    );

    return result.rows;
  },

  async getActiveEventsNear(input: { lat: number; lng: number; radius: number }) {
    const result = await query<ActiveEventRow>(
      `WITH live_events AS (
         SELECT
           e.*,
           COALESCE(
             e.end_time,
             e.start_time + CASE
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%conference%' THEN INTERVAL '8 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%business%' THEN INTERVAL '8 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%education%' THEN INTERVAL '8 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%festival%' THEN INTERVAL '6 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%club%' THEN INTERVAL '4 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%nightlife%' THEN INTERVAL '4 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%party%' THEN INTERVAL '4 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%sport%' THEN INTERVAL '3 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%football%' THEN INTERVAL '3 hours'
               WHEN lower(coalesce(e.event_type, '') || ' ' || coalesce(e.event_category, '')) LIKE '%match%' THEN INTERVAL '3 hours'
               ELSE INTERVAL '3 hours'
             END
           ) AS effective_end_time,
           (e.estimated_end_time OR e.end_time IS NULL) AS effective_estimated_end_time
         FROM events e
           WHERE e.is_active = TRUE
             AND e.source = ANY($1::text[])
           AND e.start_time <= NOW()
           AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)
       )
       SELECT
         id, name, venue_name, source, source_url, address, city, country, expected_attendance,
         event_type, event_category, start_time,
         effective_end_time AS end_time,
         effective_end_time,
         effective_estimated_end_time AS estimated_end_time,
         EXTRACT(EPOCH FROM (effective_end_time - NOW())) / 60 AS minutes_until_end,
         ST_Y(location::geometry) AS lat,
         ST_X(location::geometry) AS lng
       FROM live_events
       WHERE effective_end_time BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
       ORDER BY effective_end_time ASC, expected_attendance DESC NULLS LAST`,
      [REAL_EVENT_SOURCES, input.lat, input.lng, input.radius]
    );

    return result.rows;
  },

  async getNearbyEvents(input: {
    lat: number;
    lng: number;
    radius: number;
    days: number;
    limit: number;
  }) {
    const result = await query<NearbyEventRow>(
      `WITH latest_hotspots AS (
         SELECT DISTINCT ON (event_id)
           id AS hotspot_id,
           event_id,
           demand_score,
           demand_level,
           drivers_needed
         FROM hotspots
         WHERE event_id IS NOT NULL
         ORDER BY event_id, generated_at DESC
       )
       SELECT
         e.id,
         e.name,
         e.venue_name,
         e.source,
         e.source_url,
         e.address,
         e.city,
         e.country,
         e.expected_attendance,
         e.event_type,
         e.event_category,
         e.start_time::text,
         e.end_time::text,
         COALESCE(e.end_time, e.start_time + INTERVAL '3 hours')::text AS effective_end_time,
         COALESCE(e.estimated_end_time, e.end_time IS NULL) AS estimated_end_time,
         EXTRACT(EPOCH FROM (COALESCE(e.end_time, e.start_time + INTERVAL '3 hours') - NOW())) / 60 AS minutes_until_end,
         ST_Y(e.location::geometry) AS lat,
         ST_X(e.location::geometry) AS lng,
         ST_Distance(e.location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) AS distance_meters,
         lh.hotspot_id,
         lh.demand_score,
         lh.demand_level,
         lh.drivers_needed,
         (
           SELECT COUNT(*)::text
           FROM driver_coverage dc
           WHERE dc.hotspot_id = lh.hotspot_id
         ) AS drivers_in_zone
       FROM events e
       LEFT JOIN latest_hotspots lh ON lh.event_id = e.id
       WHERE e.is_active = TRUE
         AND e.source = ANY($1::text[])
         AND e.start_time BETWEEN NOW() AND NOW() + ($4::int || ' days')::interval
         AND e.venue_name IS NOT NULL
         AND btrim(e.venue_name) <> ''
         AND ST_DWithin(e.location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $5)
       ORDER BY e.start_time ASC, distance_meters ASC
       LIMIT $6`,
      [REAL_EVENT_SOURCES, input.lat, input.lng, input.days, input.radius, input.limit]
    );

    const hotspotIds = new Map<string, string>();
    await withTransaction(async (client) => {
      for (const row of result.rows) {
        if (!row.hotspot_id) {
          hotspotIds.set(row.id, await ensureEventHotspot(client, row.id));
        }
      }
    });

    const events = result.rows
      .map((row) => {
        const distanceMeters = toNumber(row.distance_meters);
        const driveTime = estimateDriveTime(distanceMeters);
        const demandScore = scoreUpcomingEvent(row);
        const demandLevel = row.demand_level ?? normaliseDemandLevel(demandScore);
        const driversNeeded = toNumber(row.drivers_needed, Math.max(2, Math.ceil(toNumber(row.expected_attendance, 500) / 10)));
        const driversInZone = toNumber(row.drivers_in_zone);
        const hotspotId = row.hotspot_id ?? hotspotIds.get(row.id);

        if (!hotspotId) {
          return null;
        }

        return {
          id: hotspotId,
          hotspotId,
          eventId: row.id,
          name: row.name,
          venueName: row.venue_name,
          postcode: [row.city, row.country].filter(Boolean).join(", "),
          location: {
            lat: toNumber(row.lat),
            lng: toNumber(row.lng)
          },
          demandLevel,
          demandScore,
          liveScore: Math.round(demandScore),
          driveTimeText: driveTime.text,
          durationSeconds: driveTime.seconds,
          distanceText: formatDistance(distanceMeters, row.country),
          driverSaturation: driverSaturationLabel(driversInZone, driversNeeded),
          driversInZone,
          driversNeeded,
          insightText: `${row.venue_name ?? row.name} has an upcoming ${row.event_category ?? "event"} near you.`,
          activeTimeStart: row.start_time,
          activeTimeEnd: row.end_time ?? row.effective_end_time,
          source: row.source,
          sourceUrl: row.source_url,
          estimatedEndTime: Boolean(row.estimated_end_time),
          minutesUntilEnd: toNumber(row.minutes_until_end),
          effectiveDistanceMeters: distanceMeters,
          timeRange: formatEventTimeRange(row.start_time, row.end_time ?? row.effective_end_time),
          routingDecision: "go" as const,
          canNavigate: true,
          isHighConfidence: true,
          predictionMode: "event-directory" as const,
          mlConfidence: 0.9,
          city: row.city,
          country: row.country
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => {
        const scoreA = a.demandScore + Math.max(0, 48 - (a.effectiveDistanceMeters ?? 0) / 1000);
        const scoreB = b.demandScore + Math.max(0, 48 - (b.effectiveDistanceMeters ?? 0) / 1000);
        return scoreB - scoreA;
      });

    return {
      events,
      total: events.length,
      generatedAt: new Date().toISOString(),
      requestedRadiusMeters: input.radius,
      effectiveRadiusMeters: input.radius,
      days: input.days,
      targetCount: 10,
      returnedCount: events.length,
      expandedRadius: false,
      liveWindow: "next_3_days",
      copy: "Showing events for the next 3 days near you.",
      excludedIncompleteEvents: 0,
      shortfallReason:
        events.length < 10
          ? `Only ${events.length} complete real events were found nearby.`
          : null
    };
  },

  async recordPipelineRun(input: {
    jobName: string;
    status: "success" | "failed";
    providerCounts?: Record<string, unknown>;
    rejectedMissingVenue?: number;
    enrichedCount?: number;
    generatedHotspots?: number;
    errorMessage?: string | null;
    startedAt?: Date;
  }) {
    await query(
      `INSERT INTO event_pipeline_runs (
         job_name,
         status,
         provider_counts,
         rejected_missing_venue,
         enriched_count,
         generated_hotspots,
         error_message,
         started_at,
         finished_at
       ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, NOW())`,
      [
        input.jobName,
        input.status,
        JSON.stringify(input.providerCounts ?? {}),
        input.rejectedMissingVenue ?? 0,
        input.enrichedCount ?? 0,
        input.generatedHotspots ?? 0,
        input.errorMessage ?? null,
        input.startedAt?.toISOString() ?? new Date().toISOString()
      ]
    ).catch((error: unknown) => {
      console.warn(
        JSON.stringify({
          event: "event_pipeline_run_log_failed",
          jobName: input.jobName,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    });
  },

  async getPipelineDiagnostics() {
    const [latestRuns, eventCounts, rejectedMissingVenue] = await Promise.all([
      query<{
        job_name: string;
        status: string;
        provider_counts: Record<string, unknown> | null;
        rejected_missing_venue: string | number | null;
        enriched_count: string | number | null;
        generated_hotspots: string | number | null;
        error_message: string | null;
        started_at: string;
        finished_at: string;
      }>(
        `SELECT DISTINCT ON (job_name)
           job_name,
           status,
           provider_counts,
           rejected_missing_venue,
           enriched_count,
           generated_hotspots,
           error_message,
           started_at::text,
           finished_at::text
         FROM event_pipeline_runs
         ORDER BY job_name, finished_at DESC`
      ),
      query<{ source: string; count: string }>(
        `SELECT source, COUNT(*)::text AS count
         FROM events
         WHERE is_active = TRUE
         GROUP BY source
         ORDER BY source ASC`
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM events
         WHERE is_active = TRUE
           AND (venue_name IS NULL OR btrim(venue_name) = '')`
      )
    ]);

    return {
      jobs: latestRuns.rows.map((row) => ({
        jobName: row.job_name,
        status: row.status,
        providerCounts: row.provider_counts ?? {},
        rejectedMissingVenue: toNumber(row.rejected_missing_venue),
        enrichedCount: toNumber(row.enriched_count),
        generatedHotspots: toNumber(row.generated_hotspots),
        errorMessage: row.error_message,
        startedAt: row.started_at,
        finishedAt: row.finished_at
      })),
      providerCounts: Object.fromEntries(
        eventCounts.rows.map((row) => [row.source, Number(row.count)])
      ),
      rejectedMissingVenueEvents: Number(rejectedMissingVenue.rows[0]?.count ?? 0),
      workerCommands: {
        eventWorker: "npm --prefix backend run start:worker",
        schedules: {
          marketAreaDiscovery: "*/15 * * * *",
          eventEnrichment: "*/30 * * * *",
          hotspotRefresh: "*/5 * * * *",
          staleEventPrune: "0 3 * * *",
          feedbackRetrainingExport: "0 4 * * 1"
        }
      }
    };
  },

  async enrichIncompleteEvents() {
    const result = await query<{ count: string }>(
      `WITH candidates AS (
         SELECT id
         FROM events
         WHERE is_active = TRUE
           AND source = ANY($1::text[])
           AND venue_name IS NOT NULL
           AND btrim(venue_name) <> ''
           AND expected_attendance IS NULL
         LIMIT 500
       )
       UPDATE events e
       SET expected_attendance = 500
       FROM candidates c
       WHERE e.id = c.id
       RETURNING e.id`,
      [REAL_EVENT_SOURCES]
    );

    return {
      enrichedCount: result.rowCount ?? 0
    };
  },

  async pruneStaleEvents() {
    const result = await query(
      `UPDATE events
       SET is_active = FALSE
       WHERE is_active = TRUE
         AND COALESCE(end_time, start_time + INTERVAL '3 hours') < NOW() - INTERVAL '7 days'`
    );

    return {
      pruned: result.rowCount ?? 0
    };
  },

  async exportFeedbackForRetraining() {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM prediction_feedback
       WHERE created_at > NOW() - INTERVAL '7 days'`
    );

    return {
      feedbackRecords: Number(result.rows[0]?.count ?? 0)
    };
  }
};
