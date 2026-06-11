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

const REAL_EVENT_SOURCES = ["ticketmaster", "eventbrite", "event_aggregator", "manual"];
const EVENT_REFRESH_LOOKBACK_HOURS = 12;
const EVENT_REFRESH_LOOKAHEAD_DAYS = 7;

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
  }
};
