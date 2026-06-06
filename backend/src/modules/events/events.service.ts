import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import type { EventInput } from "../../utils/normalise.js";
import { fetchPublicEventbriteEventsNear } from "../../services/eventbrite.service.js";
import type { EventSourceDiagnostic } from "../../services/eventSourceAdapter.js";
import {
  fetchTicketmasterEvents,
  fetchTicketmasterEventsNear
} from "../../services/ticketmaster.service.js";
import { fetchGooglePlaceDemandEventsNear } from "../../services/googlePlaces.service.js";

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
  city: string | null;
  country: string | null;
  expected_attendance: number | null;
  event_type: string | null;
  event_category: string | null;
  start_time: string;
  end_time: string | null;
  lat: number;
  lng: number;
}

async function upsertEvent(client: PoolClient, event: EventInput) {
  await client.query(
    `INSERT INTO events (
      external_id, source, name, venue_name, location, address, city, country,
      start_time, end_time, expected_attendance, event_type, event_category, raw_data, is_active
     ) VALUES (
      $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, $7, $8, $9,
      $10, $11, $12, $13, $14, $15::jsonb, TRUE
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
      JSON.stringify(event.rawData)
    ]
  );
}

export const eventsService = {
  async ingestEvents(cities = DEFAULT_EVENT_CITIES) {
    const ingestionErrors: Array<{ city: string; source: string; message: string }> = [];
    const eventbriteDiagnostics: EventSourceDiagnostic[] = [];
    const allEvents = (
      await Promise.all(
        cities.map(async ({ city, country, countryCode, lat, lng }) => {
          const [ticketmasterEvents, eventbriteEvents] = await Promise.all([
            fetchTicketmasterEvents(city, countryCode).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              ingestionErrors.push({ city, source: "ticketmaster", message });
              return [] as EventInput[];
            }),
            fetchPublicEventbriteEventsNear({
              lat,
              lng,
              radiusMeters: 15000,
              city,
              country
            }).then((result) => {
              eventbriteDiagnostics.push(...result.diagnostics);
              return result.events;
            }).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              ingestionErrors.push({ city, source: "eventbrite", message });
              return [] as EventInput[];
            })
          ]);

          const googlePlaceEvents = await fetchGooglePlaceDemandEventsNear({
            lat,
            lng,
            radiusMeters: 15000,
            city,
            country
          }).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            ingestionErrors.push({ city, source: "google_places", message });
            return [] as EventInput[];
          });

          return [...ticketmasterEvents, ...eventbriteEvents, ...googlePlaceEvents];
        })
      )
    ).flat();

    await withTransaction(async (client) => {
      for (const event of allEvents) {
        await upsertEvent(client, event);
      }
    });

    return {
      total: allEvents.length,
      errors: ingestionErrors,
      eventbriteDiagnostics
    };
  },

  async ingestEventsNear(input: { lat: number; lng: number; radius: number }) {
    const ingestionErrors: Array<{ source: string; message: string }> = [];
    let eventbriteDiagnostics: EventSourceDiagnostic[] = [];
    const [ticketmasterEvents, eventbriteEvents, googlePlaceEvents] = await Promise.all([
      fetchTicketmasterEventsNear({
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radius
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ingestionErrors.push({ source: "ticketmaster", message });
        return [] as EventInput[];
      }),
      fetchPublicEventbriteEventsNear({
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radius
      }).then((result) => {
        eventbriteDiagnostics = result.diagnostics;
        return result.events;
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ingestionErrors.push({ source: "eventbrite", message });
        return [] as EventInput[];
      }),
      fetchGooglePlaceDemandEventsNear({
        lat: input.lat,
        lng: input.lng,
        radiusMeters: input.radius
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        ingestionErrors.push({ source: "google_places", message });
        return [] as EventInput[];
      })
    ]);

    const allEvents = [...ticketmasterEvents, ...eventbriteEvents, ...googlePlaceEvents];

    await withTransaction(async (client) => {
      for (const event of allEvents) {
        await upsertEvent(client, event);
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
        googlePlaceEvents: googlePlaceEvents.length,
        totalEvents: allEvents.length,
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
      total: allEvents.length,
      ticketmasterEvents: ticketmasterEvents.length,
      eventbriteEvents: eventbriteEvents.length,
      googlePlaceEvents: googlePlaceEvents.length,
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
      `SELECT id, name, venue_name, city, country, expected_attendance, event_type, event_category,
              start_time, end_time,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng
       FROM events
       WHERE is_active = TRUE
         AND start_time <= NOW() + INTERVAL '3 hours'
         AND COALESCE(end_time, start_time + INTERVAL '3 hours') >= NOW()`
    );

    return result.rows;
  },

  async getActiveEventsNear(input: { lat: number; lng: number; radius: number }) {
    const result = await query<ActiveEventRow>(
      `SELECT id, name, venue_name, city, country, expected_attendance, event_type, event_category,
              start_time, end_time,
              ST_Y(location::geometry) AS lat,
              ST_X(location::geometry) AS lng
       FROM events
       WHERE is_active = TRUE
         AND start_time <= NOW() + INTERVAL '3 hours'
         AND COALESCE(end_time, start_time + INTERVAL '3 hours') >= NOW()
         AND ST_DWithin(location, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3)
       ORDER BY start_time ASC`,
      [input.lat, input.lng, input.radius]
    );

    return result.rows;
  }
};
