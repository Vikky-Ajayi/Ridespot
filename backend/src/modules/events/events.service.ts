import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import { geographyPointSql } from "../../utils/geospatial.js";
import type { EventInput } from "../../utils/normalise.js";
import { fetchEventbriteEvents } from "../../services/eventbrite.service.js";
import { fetchTicketmasterEvents } from "../../services/ticketmaster.service.js";

const DEFAULT_EVENT_CITIES: Array<{ city: string; countryCode: "GB" | "NG" }> = [
  { city: "Lagos", countryCode: "NG" },
  { city: "Abuja", countryCode: "NG" },
  { city: "London", countryCode: "GB" },
  { city: "Manchester", countryCode: "GB" },
  { city: "Birmingham", countryCode: "GB" }
];

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
    const allEvents = (
      await Promise.all(
        cities.map(async ({ city, countryCode }) => {
          const [ticketmasterEvents, eventbriteEvents] = await Promise.all([
            fetchTicketmasterEvents(city, countryCode).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              ingestionErrors.push({ city, source: "ticketmaster", message });
              return [] as EventInput[];
            }),
            fetchEventbriteEvents(city).catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error);
              ingestionErrors.push({ city, source: "eventbrite", message });
              return [] as EventInput[];
            })
          ]);

          return [...ticketmasterEvents, ...eventbriteEvents];
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
      errors: ingestionErrors
    };
  },

  async getActiveEventsWindow() {
    const result = await query<{
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
    }>(
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
  }
};
