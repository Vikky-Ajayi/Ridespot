import axios from "axios";
import pLimit from "p-limit";
import pRetry from "p-retry";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { logger } from "../../lib/logger.js";

const SEARCH_LOCATIONS = [
  { place: "Lagos, Nigeria", lat: 6.5244, lng: 3.3792, country: "NG", city: "Lagos" },
  { place: "London, United Kingdom", lat: 51.5074, lng: -0.1278, country: "GB", city: "London" },
  { place: "Manchester, United Kingdom", lat: 53.4808, lng: -2.2426, country: "GB", city: "Manchester" },
  { place: "Birmingham, United Kingdom", lat: 52.4862, lng: -1.8904, country: "GB", city: "Birmingham" },
  { place: "Leeds, United Kingdom", lat: 53.8008, lng: -1.5491, country: "GB", city: "Leeds" },
  { place: "Glasgow, United Kingdom", lat: 55.8642, lng: -4.2518, country: "GB", city: "Glasgow" },
  { place: "Bristol, United Kingdom", lat: 51.4545, lng: -2.5879, country: "GB", city: "Bristol" },
  { place: "Edinburgh, United Kingdom", lat: 55.9533, lng: -3.1883, country: "GB", city: "Edinburgh" },
  { place: "Liverpool, United Kingdom", lat: 53.4084, lng: -2.9916, country: "GB", city: "Liverpool" },
  { place: "Sheffield, United Kingdom", lat: 53.3811, lng: -1.4701, country: "GB", city: "Sheffield" },
  { place: "Nottingham, United Kingdom", lat: 52.9548, lng: -1.1581, country: "GB", city: "Nottingham" },
  { place: "Cardiff, United Kingdom", lat: 51.4816, lng: -3.1791, country: "GB", city: "Cardiff" },
  { place: "Newcastle, United Kingdom", lat: 54.9783, lng: -1.6178, country: "GB", city: "Newcastle" },
  { place: "Belfast, United Kingdom", lat: 54.5973, lng: -5.9301, country: "GB", city: "Belfast" },
  { place: "Leicester, United Kingdom", lat: 52.6369, lng: -1.1398, country: "GB", city: "Leicester" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.eventbrite.com/",
  Origin: "https://www.eventbrite.com",
};

type Location = typeof SEARCH_LOCATIONS[number];

async function fetchEventbritePage(location: Location, page: number): Promise<unknown[]> {
  const url = "https://www.eventbrite.com/api/v3/destination/search/";
  const params = {
    slots: 100,
    page,
    "expand.destination_event": [
      "primary_venue", "image", "ticket_availability", "saves",
      "event_sales_status", "primary_organizer", "public_collections",
    ].join(","),
    page_size: 50,
    source: "discover",
    lat: location.lat,
    lng: location.lng,
    distance: "50km",
    sort_by: "date",
    online_events_only: false,
  };

  const response = await pRetry(
    async () => {
      const res = await axios.get(url, { headers: HEADERS, params, timeout: 15000 });
      return res.data;
    },
    {
      retries: 4,
      minTimeout: 2000,
      maxTimeout: 10000,
      onFailedAttempt: (err) =>
        logger.warn({ page, attempt: err.attemptNumber }, "Eventbrite page fetch failed"),
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any)?.events?.results ?? [];
}

function parseEventbriteEvent(raw: Record<string, unknown>, location: Location) {
  const venue = raw.primary_venue as Record<string, unknown> | undefined;
  const address = venue?.address as Record<string, unknown> | undefined;
  if (!address?.latitude || !address?.longitude) return null;

  return {
    externalId: String(raw.id),
    source: "eventbrite" as const,
    title: String(raw.name ?? ""),
    venueName: venue?.name as string | null ?? null,
    venueAddress: address?.localized_address_display as string | null ?? null,
    venueLat: parseFloat(String(address.latitude)),
    venueLng: parseFloat(String(address.longitude)),
    city: location.city,
    country: location.country,
    startTime: new Date(String(raw.start_date) + "T" + String(raw.start_time ?? "00:00:00")),
    endTime: raw.end_date ? new Date(String(raw.end_date) + "T" + String(raw.end_time ?? "00:00:00")) : null,
    expectedAttendance: 100,
    category: (raw.tags as Array<{ display_name: string }> | undefined)?.[0]?.display_name ?? null,
    imageUrl: (raw.image as { url?: string } | undefined)?.url ?? null,
    eventUrl: raw.url as string | null ?? null,
    rawData: raw,
    updatedAt: new Date(),
  };
}

export async function runEventbriteScraper(signal?: AbortSignal): Promise<number> {
  const limit = pLimit(3);
  let totalScraped = 0;

  await Promise.all(
    SEARCH_LOCATIONS.map((location) =>
      limit(async () => {
        let page = 1;
        let hasMore = true;

        while (hasMore && !signal?.aborted) {
          try {
            const rawEvents = await fetchEventbritePage(location, page);
            if (rawEvents.length === 0) { hasMore = false; break; }

            const parsed = rawEvents
              .map((e) => parseEventbriteEvent(e as Record<string, unknown>, location))
              .filter(Boolean) as NonNullable<ReturnType<typeof parseEventbriteEvent>>[];

            if (parsed.length > 0) {
              await db.insert(eventsTable)
                .values(parsed)
                .onConflictDoUpdate({
                  target: [eventsTable.source, eventsTable.externalId],
                  set: {
                    title: sql`excluded.title`,
                    startTime: sql`excluded.start_time`,
                    endTime: sql`excluded.end_time`,
                    expectedAttendance: sql`excluded.expected_attendance`,
                    updatedAt: new Date(),
                  },
                });
              totalScraped += parsed.length;
            }

            page++;
            await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));
            if (page > 400) hasMore = false;
          } catch (err) {
            logger.error({ err, location: location.city, page }, "Eventbrite page error");
            hasMore = false;
          }
        }
      }),
    ),
  );

  return totalScraped;
}
