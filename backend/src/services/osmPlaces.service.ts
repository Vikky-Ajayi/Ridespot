import axios from "axios";
import { Agent as HttpsAgent } from "node:https";
import { env } from "../config/env.js";
import { withTransaction } from "../config/database.js";
import { canonicalMarketCountry } from "../utils/country.js";

// Forces IPv4 for Overpass requests. An empty-message error on every single region (seen
// across two consecutive production runs) matches Node's AggregateError shape exactly: when
// a host resolves to multiple addresses (IPv4 + IPv6) and connections to all of them fail,
// Node throws an AggregateError whose own top-level .message is empty by default, with the
// real detail nested in .errors -- classic symptom of a container/cloud host whose IPv6
// egress is flaky or absent while connection attempts still try it first. Forcing IPv4 is a
// standard, low-risk fix for exactly this: harmless if IPv6 was never the problem, since
// overpass-api.de is reachable over IPv4 regardless (confirmed -- this environment's own
// direct requests to it throughout this session used plain IPv4 resolution).
const overpassHttpsAgent = new HttpsAgent({ family: 4 });

// Bulk, free restaurant/food-venue source for the delivery-hotspot pipeline.
// Google Places is deliberately NOT used for the bulk national sweep (per-call billing
// makes a UK-wide grid expensive) -- Overpass (OpenStreetMap) supplies raw locations here,
// and Google Places is reserved for enriching only the top clusters
// (see restaurantClustering.service.ts).

// Only the official instance -- checked three candidate public mirrors as a fallback and
// none were usable: overpass.kumi.systems is dead (bare 500 on every call), overpass.osm.ch
// returns clean 200s with an empty "elements" array for real UK/Nigeria bboxes (silently
// wrong -- worse than an honest failure, since it would report a region as "succeeded" with
// zero venues instead of flagging it as failed), and the maps.mail.ru mirror doesn't respond
// at all. A fallback that either lies or never answers isn't worth keeping just to have one;
// better to put that effort into patience on the endpoint that actually has real data.
const OVERPASS_ENDPOINTS = [env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter"];

const RESTAURANT_AMENITIES = ["restaurant", "fast_food", "cafe"] as const;

export interface OsmRegion {
  key: string;
  label: string;
  country: "UK" | "Nigeria";
  south: number;
  west: number;
  north: number;
  east: number;
}

// Coarse regional bounding boxes -- chosen for full national coverage without needing a
// per-city grid (Overpass queries by bbox, not radius). Approximate; safe to refine later
// via the DB rather than a redeploy if a region needs splitting for size/timeout reasons.
export const OSM_REGIONS: OsmRegion[] = [
  { key: "uk-london", label: "Greater London", country: "UK", south: 51.28, west: -0.51, north: 51.7, east: 0.33 },
  { key: "uk-south-east", label: "South East England", country: "UK", south: 50.72, west: -1.8, north: 51.75, east: 1.45 },
  { key: "uk-south-west", label: "South West England", country: "UK", south: 49.9, west: -6.42, north: 51.7, east: -1.45 },
  { key: "uk-east", label: "East of England", country: "UK", south: 51.45, west: -0.55, north: 52.95, east: 1.77 },
  { key: "uk-midlands-east", label: "East Midlands", country: "UK", south: 52.05, west: -1.8, north: 53.55, east: -0.1 },
  { key: "uk-midlands-west", label: "West Midlands", country: "UK", south: 51.85, west: -3.25, north: 53.2, east: -1.35 },
  { key: "uk-yorkshire", label: "Yorkshire and the Humber", country: "UK", south: 53.3, west: -2.6, north: 54.6, east: -0.1 },
  { key: "uk-north-west", label: "North West England", country: "UK", south: 52.95, west: -3.65, north: 55.05, east: -2.1 },
  { key: "uk-north-east", label: "North East England", country: "UK", south: 54.35, west: -2.7, north: 55.85, east: -1.1 },
  { key: "uk-wales", label: "Wales", country: "UK", south: 51.35, west: -5.35, north: 53.45, east: -2.65 },
  { key: "uk-scotland", label: "Scotland", country: "UK", south: 54.6, west: -8.75, north: 60.9, east: -0.7 },
  { key: "uk-northern-ireland", label: "Northern Ireland", country: "UK", south: 54.0, west: -8.2, north: 55.3, east: -5.4 },
  { key: "ng-lagos", label: "Lagos Metro", country: "Nigeria", south: 6.35, west: 3.1, north: 6.7, east: 3.65 },
  { key: "ng-abuja", label: "Abuja (FCT)", country: "Nigeria", south: 8.75, west: 6.95, north: 9.35, east: 7.65 }
];

export interface OsmVenue {
  osmType: "node" | "way";
  osmId: string;
  name: string | null;
  amenity: string;
  cuisine: string | null;
  lat: number;
  lng: number;
  city: string | null;
  country: "UK" | "Nigeria";
}

function buildOverpassQuery(region: OsmRegion) {
  const bbox = `${region.south},${region.west},${region.north},${region.east}`;
  const amenityPattern = `^(${RESTAURANT_AMENITIES.join("|")})$`;
  return `[out:json][timeout:180];
(
  node["amenity"~"${amenityPattern}"](${bbox});
  way["amenity"~"${amenityPattern}"](${bbox});
);
out center tags;`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryOverpass(qlQuery: string): Promise<{ elements: Array<Record<string, unknown>> }> {
  let lastError: unknown = null;
  let lastRetriedStatus: number | null = null;
  let retriesExhausted = 0;

  // Only one endpoint now (see OVERPASS_ENDPOINTS above) -- all the retry budget that used
  // to be split across a real attempt + a doomed fallback attempt goes toward giving the one
  // endpoint that actually has data more real chances instead.
  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 8; attempt++) {
      try {
        const response = await axios.post(endpoint, `data=${encodeURIComponent(qlQuery)}`, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 190000,
          validateStatus: () => true,
          httpsAgent: overpassHttpsAgent
        });

        if (
          response.status === 429 ||
          response.status === 500 ||
          response.status === 502 ||
          response.status === 503 ||
          response.status === 504
        ) {
          // All of these are transient signals from a shared public instance under load
          // (fair-use limiter, upstream overload, proxy hiccups) -- confirmed live that a
          // plain retry of the exact same query against the exact same endpoint succeeds
          // (e.g. the London region: 502 on a first attempt, 200 with real data on a clean
          // retry seconds later). The previous version only retried on 429/504 and treated
          // 500/502/503 as final, which gave up on the primary endpoint after one attempt
          // and fell straight through to the kumi.systems fallback -- which is itself
          // unreliable (confirmed separately: it returns a bare 500 on every call), so every
          // region ended up failing even though the primary would have worked on retry.
          // Track this so that if every attempt lands here, throwing still carries the last
          // status seen instead of an empty/generic message.
          lastRetriedStatus = response.status;
          retriesExhausted += 1;
          await sleep(attempt * 10000);
          continue;
        }

        if (response.status < 200 || response.status >= 300) {
          lastError = new Error(`Overpass returned HTTP ${response.status}`);
          break;
        }

        if (!Array.isArray(response.data?.elements)) {
          lastError = new Error("Overpass response missing elements array");
          break;
        }

        return response.data as { elements: Array<Record<string, unknown>> };
      } catch (error) {
        // The last two runs reported an empty error message for every single region -- that
        // matches Node's AggregateError (thrown when a hostname resolves to multiple
        // addresses, e.g. IPv4+IPv6, and connection attempts to all of them fail): its own
        // top-level .message is empty by default, with the real detail nested in .errors.
        // Confirmed this exact shape independently in this same environment against a
        // different host earlier, so check for it explicitly rather than just guessing again.
        const axiosCode = (error as { code?: string })?.code;
        const isAxiosError = (error as { isAxiosError?: boolean })?.isAxiosError;
        const rawMessage = error instanceof Error ? error.message : undefined;
        const nestedErrors = (error as { errors?: unknown[] })?.errors;
        const nestedDetail = Array.isArray(nestedErrors)
          ? nestedErrors
              .map((nested) =>
                nested instanceof Error
                  ? `${nested.message}${(nested as { code?: string }).code ? ` (${(nested as { code?: string }).code})` : ""}`
                  : String(nested)
              )
              .join("; ")
          : null;
        const detail = [
          rawMessage || null,
          axiosCode ? `code=${axiosCode}` : null,
          isAxiosError ? "axios=true" : null,
          nestedDetail ? `nested=[${nestedDetail}]` : null,
          `endpoint=${endpoint}`,
          `attempt=${attempt}`
        ]
          .filter(Boolean)
          .join(" | ");
        lastError = new Error(detail || `Overpass request threw with no diagnostic info (raw=${String(error)})`);
        await sleep(attempt * 3000);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error(
    retriesExhausted > 0
      ? `Overpass query exhausted all retries -- last transient status was HTTP ${lastRetriedStatus}`
      : "Overpass query failed on all endpoints"
  );
}

function parseElement(element: Record<string, unknown>, region: OsmRegion): OsmVenue | null {
  const type = element.type;
  if (type !== "node" && type !== "way") {
    return null;
  }

  const id = element.id;
  const tags = (element.tags as Record<string, unknown> | undefined) ?? {};
  const amenity = typeof tags.amenity === "string" ? tags.amenity : null;
  if (id === undefined || !amenity || !RESTAURANT_AMENITIES.includes(amenity as (typeof RESTAURANT_AMENITIES)[number])) {
    return null;
  }

  let lat: number | null = null;
  let lng: number | null = null;

  if (type === "node") {
    lat = typeof element.lat === "number" ? element.lat : null;
    lng = typeof element.lon === "number" ? element.lon : null;
  } else {
    const center = element.center as Record<string, unknown> | undefined;
    lat = typeof center?.lat === "number" ? center.lat : null;
    lng = typeof center?.lon === "number" ? center.lon : null;
  }

  if (lat === null || lng === null) {
    return null;
  }

  const name = typeof tags.name === "string" && tags.name.trim() ? tags.name.trim() : null;

  return {
    osmType: type,
    osmId: String(id),
    name,
    amenity,
    cuisine: typeof tags.cuisine === "string" ? tags.cuisine : null,
    lat,
    lng,
    city: typeof tags["addr:city"] === "string" ? tags["addr:city"] : null,
    country: canonicalMarketCountry(region.country) === "Nigeria" ? "Nigeria" : "UK"
  };
}

export async function fetchRestaurantVenuesForRegion(region: OsmRegion): Promise<OsmVenue[]> {
  const data = await queryOverpass(buildOverpassQuery(region));
  return data.elements
    .map((element) => parseElement(element, region))
    .filter((venue): venue is OsmVenue => venue !== null && Boolean(venue.name));
}

const UPSERT_CHUNK_SIZE = 300;

export async function persistRestaurantVenues(venues: OsmVenue[]) {
  if (venues.length === 0) {
    return 0;
  }

  let persisted = 0;

  await withTransaction(async (client) => {
    for (let i = 0; i < venues.length; i += UPSERT_CHUNK_SIZE) {
      const chunk = venues.slice(i, i + UPSERT_CHUNK_SIZE);
      const values: unknown[] = [];
      const rows: string[] = [];

      chunk.forEach((venue, index) => {
        const base = index * 8;
        rows.push(
          `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, ST_SetSRID(ST_MakePoint($${base + 6}, $${base + 5}), 4326)::geography, $${base + 7}, $${base + 8}, TRUE, NOW())`
        );
        values.push(
          venue.osmType,
          venue.osmId,
          venue.name,
          venue.amenity,
          venue.lat,
          venue.lng,
          venue.city,
          venue.country
        );
      });

      await client.query(
        `INSERT INTO restaurant_venues (
           osm_type, osm_id, name, amenity, location, city, country, is_active, fetched_at
         ) VALUES ${rows.join(", ")}
         ON CONFLICT (osm_type, osm_id) DO UPDATE SET
           name = EXCLUDED.name,
           amenity = EXCLUDED.amenity,
           location = EXCLUDED.location,
           city = EXCLUDED.city,
           country = EXCLUDED.country,
           is_active = TRUE,
           fetched_at = NOW()`,
        values
      );

      persisted += chunk.length;
    }
  });

  return persisted;
}

export async function refreshAllRestaurantVenues() {
  const results: Array<{ region: string; venues: number; status: "ok" | "failed"; message?: string }> = [];

  for (const region of OSM_REGIONS) {
    try {
      const venues = await fetchRestaurantVenuesForRegion(region);
      const persisted = await persistRestaurantVenues(venues);
      results.push({ region: region.key, venues: persisted, status: "ok" });
      console.info(
        JSON.stringify({
          event: "osm_restaurant_region_ingested",
          region: region.key,
          label: region.label,
          venuesFound: venues.length,
          venuesPersisted: persisted
        })
      );
      // Be a good citizen of a free, shared public service between regional queries -- 14
      // large regional queries back-to-back was tripping the fair-use limiter (confirmed
      // live: overpass-api.de returns real data on a clean retry, it just needs breathing
      // room), which then burned through retries onto the unreliable kumi.systems fallback.
      await sleep(20000);
    } catch (error) {
      const message =
        (error instanceof Error ? error.message : "") || String(error) || "Unknown error (no message, no string form)";
      results.push({ region: region.key, venues: 0, status: "failed", message });
      console.warn(
        JSON.stringify({ event: "osm_restaurant_region_failed", region: region.key, message })
      );
    }
  }

  return results;
}
