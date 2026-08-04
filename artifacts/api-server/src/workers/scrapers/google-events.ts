import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { logger } from "../../lib/logger.js";

const QUERIES = [
  { q: "events in Lagos today", city: "Lagos", country: "NG", defaultLat: 6.5244, defaultLng: 3.3792 },
  { q: "events in Lagos this weekend", city: "Lagos", country: "NG", defaultLat: 6.5244, defaultLng: 3.3792 },
  { q: "events in London today", city: "London", country: "GB", defaultLat: 51.5074, defaultLng: -0.1278 },
  { q: "events in London this week", city: "London", country: "GB", defaultLat: 51.5074, defaultLng: -0.1278 },
  { q: "events in Manchester today", city: "Manchester", country: "GB", defaultLat: 53.4808, defaultLng: -2.2426 },
  { q: "events in Birmingham today", city: "Birmingham", country: "GB", defaultLat: 52.4862, defaultLng: -1.8904 },
  { q: "events in Glasgow this week", city: "Glasgow", country: "GB", defaultLat: 55.8642, defaultLng: -4.2518 },
  { q: "events in Edinburgh today", city: "Edinburgh", country: "GB", defaultLat: 55.9533, defaultLng: -3.1883 },
  { q: "events in Bristol this weekend", city: "Bristol", country: "GB", defaultLat: 51.4545, defaultLng: -2.5879 },
];

const GOOGLE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};

interface JsonLdEvent {
  "@type": string;
  name?: string;
  startDate?: string;
  endDate?: string;
  url?: string;
  image?: string;
  location?: {
    name?: string;
    address?: { streetAddress?: string };
    geo?: { latitude?: number | string; longitude?: number | string };
  };
}

type EventRow = typeof eventsTable.$inferInsert;

export async function runGoogleEventsScraper(): Promise<number> {
  let total = 0;

  for (const query of QUERIES) {
    try {
      const res = await axios.get("https://www.google.com/search", {
        params: { q: query.q, tbm: "eventsearch" },
        headers: GOOGLE_HEADERS,
        timeout: 10000,
      });

      const $ = cheerio.load(res.data as string);
      const toInsert: EventRow[] = [];

      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() ?? "{}") as JsonLdEvent | JsonLdEvent[];
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item["@type"] === "Event" && item.location?.geo?.latitude) {
              const externalId = crypto
                .createHash("md5")
                .update(`${item.name ?? ""}|${item.startDate ?? ""}`)
                .digest("hex");

              toInsert.push({
                externalId,
                source: "google",
                title: item.name ?? "Unknown event",
                venueName: item.location.name ?? null,
                venueAddress: item.location.address?.streetAddress ?? null,
                venueLat: parseFloat(String(item.location.geo.latitude)),
                venueLng: parseFloat(String(item.location.geo.longitude ?? query.defaultLng)),
                city: query.city,
                country: query.country,
                startTime: item.startDate ? new Date(item.startDate) : new Date(),
                endTime: item.endDate ? new Date(item.endDate) : null,
                expectedAttendance: 100,
                eventUrl: item.url ?? null,
                imageUrl: item.image ?? null,
                rawData: item as unknown as Record<string, unknown>,
                updatedAt: new Date(),
              });
              total++;
            }
          }
        } catch {
          // malformed JSON-LD — skip
        }
      });

      if (toInsert.length > 0) {
        await db.insert(eventsTable)
          .values(toInsert)
          .onConflictDoUpdate({
            target: [eventsTable.source, eventsTable.externalId],
            set: { updatedAt: new Date() },
          });
      }

      await new Promise((r) => setTimeout(r, 1000 + Math.random() * 1000));
    } catch (err) {
      logger.warn({ err, query: query.q }, "Google events scrape failed");
    }
  }

  return total;
}
