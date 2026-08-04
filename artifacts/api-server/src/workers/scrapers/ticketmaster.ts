import axios from "axios";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { logger } from "../../lib/logger.js";

const TM_BASE = "https://app.ticketmaster.com/discovery/v2";

const TM_LOCATIONS = [
  { city: "Lagos", countryCode: "NG", dbCity: "Lagos", country: "NG" },
  { city: "London", countryCode: "GB", dbCity: "London", country: "GB" },
  { city: "Manchester", countryCode: "GB", dbCity: "Manchester", country: "GB" },
  { city: "Birmingham", countryCode: "GB", dbCity: "Birmingham", country: "GB" },
  { city: "Leeds", countryCode: "GB", dbCity: "Leeds", country: "GB" },
  { city: "Glasgow", countryCode: "GB", dbCity: "Glasgow", country: "GB" },
  { city: "Bristol", countryCode: "GB", dbCity: "Bristol", country: "GB" },
  { city: "Edinburgh", countryCode: "GB", dbCity: "Edinburgh", country: "GB" },
  { city: "Liverpool", countryCode: "GB", dbCity: "Liverpool", country: "GB" },
  { city: "Sheffield", countryCode: "GB", dbCity: "Sheffield", country: "GB" },
  { city: "Nottingham", countryCode: "GB", dbCity: "Nottingham", country: "GB" },
  { city: "Cardiff", countryCode: "GB", dbCity: "Cardiff", country: "GB" },
  { city: "Newcastle", countryCode: "GB", dbCity: "Newcastle", country: "GB" },
];

type EventRow = typeof eventsTable.$inferInsert;

export async function runTicketmasterScraper(): Promise<number> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    logger.warn("TICKETMASTER_API_KEY not set — skipping");
    return 0;
  }

  let total = 0;

  for (const loc of TM_LOCATIONS) {
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const res = await axios.get(`${TM_BASE}/events.json`, {
          params: { apikey: apiKey, city: loc.city, countryCode: loc.countryCode, size: 200, page },
          timeout: 10000,
        });

        const embedded = (res.data?._embedded?.events ?? []) as Record<string, unknown>[];
        if (embedded.length === 0) { hasMore = false; break; }

        const parsed: EventRow[] = [];
        for (const e of embedded) {
          const embeddedData = e._embedded as Record<string, unknown> | undefined;
          const venues = embeddedData?.venues as Record<string, unknown>[] | undefined;
          const venue = venues?.[0];
          const location = venue?.location as Record<string, unknown> | undefined;
          if (!location?.latitude) continue;

          const address = venue?.address as Record<string, unknown> | undefined;
          const cityData = venue?.city as Record<string, unknown> | undefined;
          const dates = e.dates as Record<string, unknown> | undefined;
          const start = dates?.start as Record<string, unknown> | undefined;
          const classifications = e.classifications as Array<Record<string, unknown>> | undefined;
          const segment = classifications?.[0]?.segment as Record<string, unknown> | undefined;
          const images = e.images as Array<Record<string, unknown>> | undefined;

          parsed.push({
            externalId: String(e.id ?? ""),
            source: "ticketmaster",
            title: String(e.name ?? ""),
            venueName: (venue?.name as string | null) ?? null,
            venueAddress: `${address?.line1 ?? ""}, ${cityData?.name ?? ""}`,
            venueLat: parseFloat(String(location.latitude)),
            venueLng: parseFloat(String(location.longitude)),
            city: loc.dbCity,
            country: loc.country,
            startTime: new Date(String(start?.dateTime ?? start?.localDate ?? Date.now())),
            expectedAttendance: 500,
            category: (segment?.name as string | null) ?? null,
            imageUrl: (images?.[0]?.url as string | null) ?? null,
            eventUrl: (e.url as string | null) ?? null,
            rawData: e,
            updatedAt: new Date(),
          });
        }

        if (parsed.length > 0) {
          await db.insert(eventsTable)
            .values(parsed)
            .onConflictDoUpdate({
              target: [eventsTable.source, eventsTable.externalId],
              set: { updatedAt: new Date(), title: sql`excluded.title` },
            });
          total += parsed.length;
        }

        const totalPages = res.data?.page?.totalPages as number | undefined;
        page++;
        if (totalPages && page >= totalPages) hasMore = false;
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        logger.error({ err, city: loc.city, page }, "Ticketmaster page error");
        hasMore = false;
      }
    }
  }

  return total;
}
