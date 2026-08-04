import axios from "axios";
import pLimit from "p-limit";
import pRetry from "p-retry";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { logger } from "../../lib/logger.js";

// 15 cities × 5 date ranges × 8 categories = 600 search axes
// Each axis returns up to 400 pages × 50 events = 20,000 events
// Total ceiling: ~12M deduplicated via upsert

const SEARCH_LOCATIONS = [
  { place: "Lagos, Nigeria",          lat: 6.5244,  lng: 3.3792,  country: "NG", city: "Lagos" },
  { place: "London, United Kingdom",  lat: 51.5074, lng: -0.1278, country: "GB", city: "London" },
  { place: "Manchester, United Kingdom", lat: 53.4808, lng: -2.2426, country: "GB", city: "Manchester" },
  { place: "Birmingham, United Kingdom", lat: 52.4862, lng: -1.8904, country: "GB", city: "Birmingham" },
  { place: "Leeds, United Kingdom",   lat: 53.8008, lng: -1.5491, country: "GB", city: "Leeds" },
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

// 5 date-window dimensions
function dateWindows() {
  const now = new Date();
  const iso = (d: Date) => d.toISOString().split("T")[0];
  const add = (days: number) => new Date(now.getTime() + days * 86_400_000);
  return [
    { label: "today",      start: iso(now),       end: iso(add(1))  },
    { label: "this_week",  start: iso(now),       end: iso(add(7))  },
    { label: "next_week",  start: iso(add(7)),    end: iso(add(14)) },
    { label: "this_month", start: iso(now),       end: iso(add(30)) },
    { label: "next_3mo",   start: iso(add(30)),   end: iso(add(90)) },
  ];
}

// 8 category dimensions (Eventbrite tag slugs)
const CATEGORIES = [
  "music",
  "business",
  "food-drink",
  "arts",
  "sports-fitness",
  "technology",
  "community",
  "charity-causes",
];

type Location = typeof SEARCH_LOCATIONS[number];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.eventbrite.com/",
  Origin: "https://www.eventbrite.com",
};

async function fetchEventbritePage(
  location: Location,
  page: number,
  dateStart?: string,
  dateEnd?: string,
  category?: string,
): Promise<unknown[]> {
  const url = "https://www.eventbrite.com/api/v3/destination/search/";
  const params: Record<string, unknown> = {
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
  if (dateStart) params["start_date.range_start"] = dateStart;
  if (dateEnd)   params["start_date.range_end"]   = dateEnd;
  if (category)  params["tags"]                   = category;

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
        logger.warn(
          { city: location.city, page, category, attempt: err.attemptNumber },
          "Eventbrite page fetch failed",
        ),
    },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (response as any)?.events?.results ?? [];
}

function parseEventbriteEvent(raw: Record<string, unknown>, location: Location) {
  const venue   = raw.primary_venue as Record<string, unknown> | undefined;
  const address = venue?.address as Record<string, unknown> | undefined;
  if (!address?.latitude || !address?.longitude) return null;

  return {
    externalId: String(raw.id),
    source: "eventbrite" as const,
    title: String(raw.name ?? ""),
    venueName:    (venue?.name as string | undefined) ?? null,
    venueAddress: (address?.localized_address_display as string | undefined) ?? null,
    venueLat: parseFloat(String(address.latitude)),
    venueLng: parseFloat(String(address.longitude)),
    city: location.city,
    country: location.country,
    startTime: new Date(String(raw.start_date) + "T" + String(raw.start_time ?? "00:00:00")),
    endTime: raw.end_date
      ? new Date(String(raw.end_date) + "T" + String(raw.end_time ?? "00:00:00"))
      : null,
    expectedAttendance: 100,
    category: (raw.tags as Array<{ display_name: string }> | undefined)?.[0]?.display_name ?? null,
    imageUrl:  (raw.image as { url?: string } | undefined)?.url ?? null,
    eventUrl:  (raw.url as string | undefined) ?? null,
    rawData: raw,
    updatedAt: new Date(),
  };
}

/** Scrape one search axis: location × date-window × category */
async function scrapeAxis(
  location: Location,
  dateStart: string,
  dateEnd: string,
  category: string,
  signal?: AbortSignal,
): Promise<number> {
  let page = 1;
  let total = 0;

  while (!signal?.aborted) {
    try {
      const rawEvents = await fetchEventbritePage(location, page, dateStart, dateEnd, category);
      if (rawEvents.length === 0) break;

      const parsed = rawEvents
        .map((e) => parseEventbriteEvent(e as Record<string, unknown>, location))
        .filter(Boolean) as NonNullable<ReturnType<typeof parseEventbriteEvent>>[];

      if (parsed.length > 0) {
        await db
          .insert(eventsTable)
          .values(parsed)
          .onConflictDoUpdate({
            target: [eventsTable.source, eventsTable.externalId],
            set: {
              title:              sql`excluded.title`,
              startTime:          sql`excluded.start_time`,
              endTime:            sql`excluded.end_time`,
              expectedAttendance: sql`excluded.expected_attendance`,
              updatedAt:          new Date(),
            },
          });
        total += parsed.length;
      }

      page++;
      // Polite delay: 300–600 ms between pages
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 300));

      // Cap at 400 pages per axis (~20k events) — across all axes this reaches millions
      if (page > 400) break;
    } catch (err) {
      logger.error({ err, city: location.city, page, category }, "Eventbrite axis error");
      break;
    }
  }

  return total;
}

export async function runEventbriteScraper(signal?: AbortSignal): Promise<number> {
  // Build all 600 axes: 15 locations × 5 date windows × 8 categories
  const windows = dateWindows();
  const axes: Array<{
    location: Location;
    dateStart: string;
    dateEnd: string;
    category: string;
  }> = [];

  for (const location of SEARCH_LOCATIONS) {
    for (const win of windows) {
      for (const category of CATEGORIES) {
        axes.push({ location, dateStart: win.start, dateEnd: win.end, category });
      }
    }
  }

  logger.info({ axisCount: axes.length }, "Eventbrite scraper starting");

  // Run up to 5 axes in parallel (keeps total concurrent requests reasonable)
  const limit = pLimit(5);
  let totalScraped = 0;

  const results = await Promise.all(
    axes.map((axis) =>
      limit(() =>
        scrapeAxis(axis.location, axis.dateStart, axis.dateEnd, axis.category, signal),
      ),
    ),
  );

  for (const n of results) totalScraped += n;

  logger.info({ totalScraped }, "Eventbrite scraper finished");
  return totalScraped;
}
