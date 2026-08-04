import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { logger } from "../../lib/logger.js";

const LAGOS_AREAS: Record<string, { lat: number; lng: number }> = {
  Lagos: { lat: 6.5244, lng: 3.3792 },
  Lekki: { lat: 6.4281, lng: 3.4219 },
  "Victoria Island": { lat: 6.4281, lng: 3.4219 },
  Ikeja: { lat: 6.6018, lng: 3.3515 },
  Surulere: { lat: 6.5006, lng: 3.3544 },
  Yaba: { lat: 6.5158, lng: 3.3794 },
  Ikoyi: { lat: 6.4535, lng: 3.389 },
  Ajah: { lat: 6.47, lng: 3.573 },
};

const LAGOS_KEYWORDS = Object.keys(LAGOS_AREAS);

function geoForTitle(title: string): { lat: number; lng: number } {
  for (const [keyword, coords] of Object.entries(LAGOS_AREAS)) {
    if (title.includes(keyword)) return coords;
  }
  return LAGOS_AREAS["Lagos"]!;
}

type EventRow = typeof eventsTable.$inferInsert;

export async function runNairalandScraper(): Promise<number> {
  const BASE = "https://www.nairaland.com";
  let total = 0;

  for (let page = 0; page < 50; page++) {
    try {
      const res = await axios.get(`${BASE}/events/${page}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 10000,
      });

      const $ = cheerio.load(res.data as string);
      const toInsert: EventRow[] = [];

      $("tr.highlighted, tr.odd, tr.even").each((_, row) => {
        const titleEl = $(row).find('a[href*="/"]').first();
        const title = titleEl.text().trim();
        if (!title) return;

        if (!LAGOS_KEYWORDS.some((k) => title.includes(k))) return;

        const coords = geoForTitle(title);
        const externalId = crypto.createHash("md5").update(`nairaland|${title}`).digest("hex");

        toInsert.push({
          externalId,
          source: "nairaland",
          title,
          venueName: null,
          venueAddress: null,
          venueLat: coords.lat,
          venueLng: coords.lng,
          city: "Lagos",
          country: "NG",
          startTime: new Date(),
          expectedAttendance: 50,
          eventUrl: titleEl.attr("href") ? `${BASE}${titleEl.attr("href") ?? ""}` : null,
          rawData: { title } as Record<string, unknown>,
          updatedAt: new Date(),
        });
        total++;
      });

      if (toInsert.length > 0) {
        await db.insert(eventsTable)
          .values(toInsert)
          .onConflictDoUpdate({
            target: [eventsTable.source, eventsTable.externalId],
            set: { updatedAt: new Date() },
          });
      }

      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      logger.error({ err, page }, "Nairaland page error");
      break;
    }
  }

  return total;
}
