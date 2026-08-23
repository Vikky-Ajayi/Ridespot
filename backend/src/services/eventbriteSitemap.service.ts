import axios from "axios";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { query, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { extractJsonLdEvents } from "./eventbrite.service.js";
import { eventsService } from "../modules/events/events.service.js";
import { OSM_REGIONS } from "./osmPlaces.service.js";
import type { EventInput } from "../utils/normalise.js";

// Eventbrite's official Discovery Search API (backend/src/services/eventbrite.service.ts ->
// fetchEventbriteOfficialDiscoveryNear) is closed to non-partner keys for most accounts, so
// it 404s in practice. This is the real volume driver instead: Eventbrite's own public
// sitemap (declared in robots.txt: https://www.eventbrite.com/sitemap_xml/sitemap_index.xml).
// It is NOT geo-segmented -- one flat global list of event detail-page URLs, split across
// gzipped shards -- so every URL has to be fetched and its JSON-LD checked against our market
// bounding boxes before we know whether it's in scope. That per-page fetch is also why this
// crawler intentionally does NOT fall back to paid geocoding for pages missing lat/lng in
// their JSON-LD -- it only keeps what's already geo-tagged, to keep this specific pipeline
// free of per-call API cost regardless of how many pages it ends up crawling.

const SITEMAP_INDEX_URL = "https://www.eventbrite.com/sitemap_xml/sitemap_index.xml";
const EVENT_SHARD_PATTERN = /\/event_pages\d+\.xml\.gz$/;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string) {
  const response = await axios.get(url, {
    headers: { "User-Agent": env.EVENTBRITE_SCRAPER_USER_AGENT, Accept: "*/*" },
    responseType: "arraybuffer",
    timeout: 30000,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }

  const buffer = Buffer.from(response.data as ArrayBuffer);
  return url.endsWith(".gz") ? gunzipSync(buffer).toString("utf-8") : buffer.toString("utf-8");
}

function extractLocUrls(xml: string) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]).filter(
    (url): url is string => Boolean(url)
  );
}

export async function refreshEventbriteSitemapIndex() {
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  const shardUrls = extractLocUrls(indexXml).filter((url) => EVENT_SHARD_PATTERN.test(url));
  let discovered = 0;

  for (const shardUrl of shardUrls) {
    try {
      const shardXml = await fetchText(shardUrl);
      const eventUrls = extractLocUrls(shardXml);

      await withTransaction(async (client) => {
        for (let i = 0; i < eventUrls.length; i += 500) {
          const chunk = eventUrls.slice(i, i + 500);
          const values: unknown[] = [];
          const rows: string[] = [];
          chunk.forEach((url, index) => {
            rows.push(`($${index * 2 + 1}, $${index * 2 + 2})`);
            values.push(url, shardUrl);
          });

          await client.query(
            `INSERT INTO eventbrite_sitemap_urls (url, source_shard)
             VALUES ${rows.join(", ")}
             ON CONFLICT (url) DO NOTHING`,
            values
          );
        }
      });

      discovered += eventUrls.length;
      console.info(
        JSON.stringify({ event: "eventbrite_sitemap_shard_indexed", shardUrl, urls: eventUrls.length })
      );
      await sleep(500);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: "eventbrite_sitemap_shard_failed",
          shardUrl,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }
  }

  return { shards: shardUrls.length, urlsDiscovered: discovered };
}

interface ClaimedUrlRow {
  url: string;
}

async function claimNextBatch(batchSize: number): Promise<string[]> {
  const result = await query<ClaimedUrlRow>(
    `UPDATE eventbrite_sitemap_urls
     SET last_crawled_at = NOW()
     WHERE url IN (
       SELECT url FROM eventbrite_sitemap_urls
       WHERE last_crawled_at IS NULL OR last_crawled_at < NOW() - INTERVAL '30 days'
       ORDER BY last_crawled_at ASC NULLS FIRST
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     RETURNING url`,
    [batchSize]
  );
  return result.rows.map((row) => row.url);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function stableHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function matchRegion(lat: number, lng: number) {
  return (
    OSM_REGIONS.find(
      (region) => lat >= region.south && lat <= region.north && lng >= region.west && lng <= region.east
    ) ?? null
  );
}

function regionCityLabel(regionKey: string, fallback: string) {
  if (regionKey === "ng-lagos") return "Lagos";
  if (regionKey === "ng-abuja") return "Abuja";
  return fallback;
}

function parseSitemapJsonLdEvent(raw: Record<string, unknown>, url: string): EventInput | null {
  const name = asString(raw.name);
  const startDate = asString(raw.startDate);
  if (!name || !startDate) return null;

  const startTime = new Date(startDate);
  if (Number.isNaN(startTime.getTime())) return null;

  const location = asRecord(raw.location);
  const geo = asRecord(location?.geo);
  const lat = toNumber(geo?.latitude);
  const lng = toNumber(geo?.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null; // no geo in JSON-LD -- skip rather than pay for geocoding at sitemap scale
  }

  const region = matchRegion(lat, lng);
  if (!region) {
    return null; // outside the UK / Lagos / Abuja coverage area
  }

  const venueName = asString(location?.name);
  const addressField = location?.address;
  const addressRecord = asRecord(addressField);
  const address =
    typeof addressField === "string"
      ? addressField
      : addressRecord
        ? [
            addressRecord.streetAddress,
            addressRecord.addressLocality,
            addressRecord.addressRegion,
            addressRecord.postalCode,
            addressRecord.addressCountry
          ]
            .map(asString)
            .filter((part): part is string => Boolean(part))
            .join(", ") || null
        : null;

  if (!venueName && !address) return null;

  const rawEndDate = asString(raw.endDate);
  const parsedEnd = rawEndDate ? new Date(rawEndDate) : null;
  const hasRealEnd = Boolean(parsedEnd && !Number.isNaN(parsedEnd.getTime()));
  const endTime = hasRealEnd ? (parsedEnd as Date) : new Date(startTime.getTime() + 3 * 60 * 60 * 1000);

  return {
    externalId: `eventbrite-sitemap:${stableHash(url)}`,
    source: "eventbrite",
    name,
    venueName: venueName ?? address?.split(",")[0]?.trim() ?? null,
    lat,
    lng,
    address,
    city: regionCityLabel(region.key, region.label),
    country: region.country === "Nigeria" ? "Nigeria" : "UK",
    startTime,
    endTime,
    expectedAttendance: null,
    eventType: "Public Event",
    eventCategory: asString(raw.eventAttendanceMode),
    sourceUrl: url,
    estimatedEndTime: !hasRealEnd,
    rawData: { ...raw, sourceUrl: url, ingestionSource: "eventbrite_sitemap_crawler" }
  };
}

export async function crawlEventbriteSitemapBatch(batchSize?: number) {
  if (!env.EVENTBRITE_SITEMAP_CRAWL_ENABLED) {
    return { claimed: 0, matched: 0, persisted: 0, failed: 0, skipped: "disabled" as const };
  }

  const urls = await claimNextBatch(batchSize ?? env.EVENTBRITE_SITEMAP_MAX_EVENT_PAGES_PER_CYCLE);
  let matched = 0;
  let persisted = 0;
  let failed = 0;

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const rawEvents = extractJsonLdEvents(html);
      let regionMatched: string | null = null;

      for (const raw of rawEvents) {
        const eventInput = parseSitemapJsonLdEvent(raw, url);
        if (!eventInput) continue;

        regionMatched = eventInput.country;
        matched += 1;
        const id = await eventsService.upsertDiscoveredEvent(eventInput);
        if (id) persisted += 1;
      }

      await query(
        `UPDATE eventbrite_sitemap_urls SET last_match_region = $2, last_status = 'ok' WHERE url = $1`,
        [url, regionMatched]
      );
    } catch (error) {
      failed += 1;
      await query(`UPDATE eventbrite_sitemap_urls SET last_status = 'failed' WHERE url = $1`, [url]).catch(
        () => {}
      );
      console.warn(
        JSON.stringify({
          event: "eventbrite_sitemap_page_failed",
          url,
          message: error instanceof Error ? error.message : String(error)
        })
      );
    }

    // Polite pacing -- this is a bulk crawl of a shared public site, not a targeted lookup.
    await sleep(300);
  }

  console.info(
    JSON.stringify({
      event: "eventbrite_sitemap_batch_completed",
      claimed: urls.length,
      matched,
      persisted,
      failed
    })
  );

  return { claimed: urls.length, matched, persisted, failed };
}
