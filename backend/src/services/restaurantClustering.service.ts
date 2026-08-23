import axios from "axios";
import { createHash } from "node:crypto";
import { query, withTransaction } from "../config/database.js";
import { env } from "../config/env.js";
import { geographyPointSql, selectLatLng } from "../utils/geospatial.js";

// Grid-based spatial clustering of restaurant_venues (bulk OSM data) into delivery-hotspot
// candidates. Deliberately a simple equal-size grid rather than DBSCAN: it's O(n), needs no
// clustering library, and is easy to reason about/tune (cell size = target cluster radius).
// A documented simplification -- adjacent qualifying cells are not merged in v1, so a dense
// area can show as more than one cluster rather than one large one.

const CELL_SIZE_DEGREES_LAT = 0.0045; // ~500m
const MIN_VENUES_PER_CLUSTER = 5;
const GOOGLE_ENRICHMENT_TOP_N = 250; // bounds Google Places spend regardless of national scale

function cellSizeDegreesLng(lat: number) {
  // Longitude degrees shrink toward the poles; keep cells close to square in meters.
  const metersPerDegreeLat = 111320;
  const targetMeters = CELL_SIZE_DEGREES_LAT * metersPerDegreeLat;
  const metersPerDegreeLng = Math.max(1, 111320 * Math.cos((lat * Math.PI) / 180));
  return targetMeters / metersPerDegreeLng;
}

interface VenueRow {
  id: string;
  name: string | null;
  city: string | null;
  country: string | null;
  lat: number;
  lng: number;
  google_rating: string | number | null;
  google_rating_count: string | number | null;
}

interface ClusterCandidate {
  clusterKey: string;
  name: string;
  lat: number;
  lng: number;
  venueCount: number;
  city: string | null;
  country: "Nigeria" | "UK";
  avgRating: number | null;
  totalRatingCount: number;
}

function stableClusterKey(country: string, cellLatIndex: number, cellLngIndex: number) {
  return createHash("sha1").update(`${country}:${cellLatIndex}:${cellLngIndex}`).digest("hex").slice(0, 24);
}

async function loadActiveVenues(country: "Nigeria" | "UK"): Promise<VenueRow[]> {
  const result = await query<VenueRow>(
    `SELECT id, name, city, country, ${selectLatLng("location")}, google_rating, google_rating_count
     FROM restaurant_venues
     WHERE is_active = TRUE AND country = $1`,
    [country]
  );
  return result.rows;
}

function buildClusters(venues: VenueRow[], country: "Nigeria" | "UK"): ClusterCandidate[] {
  const buckets = new Map<string, VenueRow[]>();

  for (const venue of venues) {
    const lat = Number(venue.lat);
    const lng = Number(venue.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const lngCellSize = cellSizeDegreesLng(lat);
    const latIndex = Math.floor(lat / CELL_SIZE_DEGREES_LAT);
    const lngIndex = Math.floor(lng / lngCellSize);
    const key = `${latIndex}:${lngIndex}`;

    const existing = buckets.get(key) ?? [];
    existing.push(venue);
    buckets.set(key, existing);
  }

  const clusters: ClusterCandidate[] = [];

  for (const [key, cellVenues] of buckets.entries()) {
    if (cellVenues.length < MIN_VENUES_PER_CLUSTER) continue;

    const [latIndexStr, lngIndexStr] = key.split(":");
    const centroidLat = cellVenues.reduce((sum, v) => sum + Number(v.lat), 0) / cellVenues.length;
    const centroidLng = cellVenues.reduce((sum, v) => sum + Number(v.lng), 0) / cellVenues.length;

    const ratedVenues = cellVenues.filter((v) => v.google_rating !== null);
    const avgRating =
      ratedVenues.length > 0
        ? ratedVenues.reduce((sum, v) => sum + Number(v.google_rating), 0) / ratedVenues.length
        : null;
    const totalRatingCount = cellVenues.reduce(
      (sum, v) => sum + (v.google_rating_count !== null ? Number(v.google_rating_count) : 0),
      0
    );

    const cityCounts = new Map<string, number>();
    for (const v of cellVenues) {
      if (!v.city) continue;
      cityCounts.set(v.city, (cityCounts.get(v.city) ?? 0) + 1);
    }
    const dominantCity =
      [...cityCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? cellVenues[0]?.city ?? null;

    clusters.push({
      clusterKey: stableClusterKey(country, Number(latIndexStr), Number(lngIndexStr)),
      name: dominantCity ? `${dominantCity} Restaurant Cluster` : "Restaurant Cluster",
      lat: centroidLat,
      lng: centroidLng,
      venueCount: cellVenues.length,
      city: dominantCity,
      country,
      avgRating,
      totalRatingCount
    });
  }

  return clusters.sort((a, b) => b.venueCount - a.venueCount);
}

async function persistClusters(clusters: ClusterCandidate[], country: "Nigeria" | "UK") {
  await withTransaction(async (client) => {
    const seenKeys: string[] = [];

    for (const cluster of clusters) {
      seenKeys.push(cluster.clusterKey);
      await client.query(
        `INSERT INTO restaurant_clusters (
           cluster_key, name, location, radius_meters, venue_count, avg_rating,
           total_rating_count, city, country, is_active, computed_at
         ) VALUES (
           $1, $2, ${geographyPointSql("$4", "$3")}, $5, $6, $7, $8, $9, $10, TRUE, NOW()
         )
         ON CONFLICT (cluster_key) DO UPDATE SET
           name = EXCLUDED.name,
           location = EXCLUDED.location,
           venue_count = EXCLUDED.venue_count,
           avg_rating = EXCLUDED.avg_rating,
           total_rating_count = EXCLUDED.total_rating_count,
           city = EXCLUDED.city,
           country = EXCLUDED.country,
           is_active = TRUE,
           computed_at = NOW()`,
        [
          cluster.clusterKey,
          cluster.name,
          cluster.lat,
          cluster.lng,
          400,
          cluster.venueCount,
          cluster.avgRating,
          cluster.totalRatingCount,
          cluster.city,
          cluster.country
        ]
      );
    }

    // Scoped to this country only -- without the country filter, a run over one country's
    // clusters would deactivate the other country's clusters computed just before it.
    await client.query(
      `UPDATE restaurant_clusters SET is_active = FALSE
       WHERE is_active = TRUE AND country = $2 AND NOT (cluster_key = ANY($1::text[]))`,
      [seenKeys, country]
    );
  });
}

const placesClient = axios.create({ baseURL: "https://maps.googleapis.com/maps/api/place", timeout: 10000 });

async function enrichClusterWithGooglePlaces(cluster: ClusterCandidate) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await placesClient.get("/nearbysearch/json", {
      params: {
        key: env.GOOGLE_MAPS_API_KEY,
        location: `${cluster.lat},${cluster.lng}`,
        radius: 400,
        type: "restaurant"
      },
      validateStatus: () => true
    });

    const results: Array<Record<string, unknown>> = Array.isArray(response.data?.results)
      ? response.data.results
      : [];
    if (results.length === 0) {
      return null;
    }

    const ratings = results
      .map((place) => (typeof place.rating === "number" ? place.rating : null))
      .filter((rating): rating is number => rating !== null);
    const ratingCounts = results.map((place) =>
      typeof place.user_ratings_total === "number" ? place.user_ratings_total : 0
    );

    return {
      avgRating: ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : null,
      totalRatingCount: ratingCounts.reduce((sum, c) => sum + c, 0)
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "restaurant_cluster_enrichment_failed",
        clusterKey: cluster.clusterKey,
        message: error instanceof Error ? error.message : String(error)
      })
    );
    return null;
  }
}

export async function recomputeRestaurantClusters() {
  const summary: Record<string, number> = {};

  for (const country of ["UK", "Nigeria"] as const) {
    const venues = await loadActiveVenues(country);
    const clusters = buildClusters(venues, country);

    const topClusters = clusters.slice(0, GOOGLE_ENRICHMENT_TOP_N);
    await Promise.all(
      topClusters.map(async (cluster) => {
        const enrichment = await enrichClusterWithGooglePlaces(cluster);
        if (enrichment) {
          cluster.avgRating = enrichment.avgRating ?? cluster.avgRating;
          cluster.totalRatingCount = Math.max(cluster.totalRatingCount, enrichment.totalRatingCount);
        }
      })
    );

    await persistClusters(clusters, country);
    summary[country] = clusters.length;

    console.info(
      JSON.stringify({
        event: "restaurant_clusters_recomputed",
        country,
        venuesConsidered: venues.length,
        clustersFound: clusters.length,
        enrichedWithGooglePlaces: topClusters.length
      })
    );
  }

  return summary;
}
