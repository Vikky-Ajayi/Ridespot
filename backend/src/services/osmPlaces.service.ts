import axios from "axios";
import { env } from "../config/env.js";
import { withTransaction } from "../config/database.js";
import { canonicalMarketCountry } from "../utils/country.js";

// Bulk, free restaurant/food-venue source for the delivery-hotspot pipeline.
// Google Places is deliberately NOT used for the bulk national sweep (per-call billing
// makes a UK-wide grid expensive) -- Overpass (OpenStreetMap) supplies raw locations here,
// and Google Places is reserved for enriching only the top clusters
// (see restaurantClustering.service.ts).

const OVERPASS_ENDPOINTS = [
  env.OVERPASS_API_URL || "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];

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

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.post(endpoint, `data=${encodeURIComponent(qlQuery)}`, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 190000,
          validateStatus: () => true
        });

        if (response.status === 429 || response.status === 504) {
          // Fair-use limiter -- back off and retry rather than hammering the endpoint.
          await sleep(attempt * 5000);
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
        lastError = error;
        await sleep(attempt * 3000);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Overpass query failed on all endpoints");
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
      // Be a good citizen of a free, shared public service between regional queries.
      await sleep(2000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ region: region.key, venues: 0, status: "failed", message });
      console.warn(
        JSON.stringify({ event: "osm_restaurant_region_failed", region: region.key, message })
      );
    }
  }

  return results;
}
