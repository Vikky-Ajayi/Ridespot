import { query } from "../config/database.js";
import { eventsService } from "../modules/events/events.service.js";
import { driversNear, upsertGeneratedHotspots, type GeneratedHotspot } from "./hotspotGeneration.service.js";
import { scoreDeliveryDemand } from "../utils/deliveryDemandScorer.js";
import { selectLatLng } from "../utils/geospatial.js";

// Minimum venue count for a cluster to be worth turning into a driver-facing hotspot --
// keep this above restaurantClustering.service.ts's MIN_VENUES_PER_CLUSTER so only the
// clearer, denser clusters actually surface (that threshold governs storage, this one
// governs visibility, and the two are allowed to diverge as the product is tuned).
const MIN_VENUES_TO_SURFACE = 5;
const ROLLING_WINDOW_MINUTES = 55;
const EXPIRES_IN_MINUTES = 15;

interface RestaurantClusterRow {
  id: string;
  cluster_key: string;
  name: string;
  lat: number;
  lng: number;
  radius_meters: number;
  venue_count: number;
  avg_rating: string | number | null;
  total_rating_count: string | number | null;
  city: string | null;
  country: "Nigeria" | "UK";
}

async function loadActiveClusters(): Promise<RestaurantClusterRow[]> {
  const result = await query<RestaurantClusterRow>(
    `SELECT id, cluster_key, name, ${selectLatLng("location")}, radius_meters, venue_count,
            avg_rating, total_rating_count, city, country
     FROM restaurant_clusters
     WHERE is_active = TRUE AND venue_count >= $1
     ORDER BY venue_count DESC`,
    [MIN_VENUES_TO_SURFACE]
  );
  return result.rows;
}

export async function refreshDeliveryHotspots() {
  const clusters = await loadActiveClusters();
  const now = new Date();
  const activeTimeEnd = new Date(now.getTime() + ROLLING_WINDOW_MINUTES * 60 * 1000);
  const hotspots: GeneratedHotspot[] = [];
  let skipped = 0;

  for (const cluster of clusters) {
    const eventId = await eventsService.upsertDiscoveredEvent({
      externalId: cluster.cluster_key,
      source: "restaurant_cluster",
      name: `${cluster.name} Delivery Zone`,
      venueName: cluster.name,
      lat: Number(cluster.lat),
      lng: Number(cluster.lng),
      address: null,
      city: cluster.city ?? "Unknown",
      country: cluster.country,
      startTime: now,
      endTime: activeTimeEnd,
      expectedAttendance: null,
      eventType: "Delivery Zone",
      eventCategory: "Restaurant Cluster",
      sourceUrl: null,
      estimatedEndTime: false,
      rawData: {
        clusterKey: cluster.cluster_key,
        venueCount: cluster.venue_count,
        avgRating: cluster.avg_rating,
        totalRatingCount: cluster.total_rating_count,
        ingestionSource: "restaurant_cluster_pipeline"
      }
    });

    if (!eventId) {
      skipped += 1;
      continue;
    }

    const currentDrivers = await driversNear(Number(cluster.lat), Number(cluster.lng));
    const prediction = scoreDeliveryDemand({
      venueCount: cluster.venue_count,
      avgRating: cluster.avg_rating !== null ? Number(cluster.avg_rating) : null,
      totalRatingCount: cluster.total_rating_count !== null ? Number(cluster.total_rating_count) : 0,
      currentDrivers,
      country: cluster.country,
      now
    });

    hotspots.push({
      eventId,
      name: cluster.name,
      postcode: null,
      city: cluster.city,
      country: cluster.country,
      lat: Number(cluster.lat),
      lng: Number(cluster.lng),
      demandLevel: prediction.demandLevel,
      demandScore: prediction.demandScore,
      liveScore: prediction.liveScore,
      driversNeeded: prediction.driversNeeded,
      radiusMeters: cluster.radius_meters,
      driverSaturation: prediction.driverSaturation,
      mlConfidence: 0,
      predictionMode: "conservative-fallback",
      isHighConfidence: false,
      operatingConfidenceThreshold: 0.96,
      operatingAccuracyTarget: 0.98,
      fallbackReason:
        "Delivery hotspots use deterministic restaurant-density scoring, not the event ML model.",
      routingDecision: prediction.routingDecision,
      insightText: prediction.insightText,
      activeTimeStart: now.toISOString(),
      activeTimeEnd: activeTimeEnd.toISOString(),
      expiresAt: new Date(now.getTime() + EXPIRES_IN_MINUTES * 60 * 1000).toISOString(),
      category: "delivery"
    });
  }

  await upsertGeneratedHotspots(hotspots);

  console.info(
    JSON.stringify({
      event: "delivery_hotspot_refresh_completed",
      clustersConsidered: clusters.length,
      hotspotsGenerated: hotspots.length,
      skipped
    })
  );

  return { clustersConsidered: clusters.length, hotspotsGenerated: hotspots.length, skipped };
}
