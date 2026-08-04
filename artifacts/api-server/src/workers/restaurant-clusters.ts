import { Client } from "@googlemaps/google-maps-services-js";
import { db } from "@workspace/db";
import { restaurantClustersTable } from "@workspace/db/schema";
import { logger } from "../lib/logger.js";

const gmaps = new Client({});

const CLUSTER_SEED_POINTS = [
  // Lagos
  { lat: 6.4281, lng: 3.4219, city: "Lagos", country: "NG" },
  { lat: 6.6018, lng: 3.3515, city: "Lagos", country: "NG" },
  { lat: 6.439, lng: 3.474, city: "Lagos", country: "NG" },
  { lat: 6.5006, lng: 3.3544, city: "Lagos", country: "NG" },
  { lat: 6.5158, lng: 3.3794, city: "Lagos", country: "NG" },
  { lat: 6.4535, lng: 3.389, city: "Lagos", country: "NG" },
  // London
  { lat: 51.5155, lng: -0.0922, city: "London", country: "GB" }, // Shoreditch
  { lat: 51.5033, lng: -0.1195, city: "London", country: "GB" }, // South Bank
  { lat: 51.4994, lng: -0.1768, city: "London", country: "GB" }, // South Kensington
  { lat: 51.5137, lng: -0.1564, city: "London", country: "GB" }, // Soho
  { lat: 51.5196, lng: -0.0886, city: "London", country: "GB" }, // Bethnal Green
  // Manchester
  { lat: 53.4808, lng: -2.2426, city: "Manchester", country: "GB" },
  { lat: 53.4757, lng: -2.2356, city: "Manchester", country: "GB" },
  // Birmingham
  { lat: 52.4862, lng: -1.8904, city: "Birmingham", country: "GB" },
  { lat: 52.4797, lng: -1.9026, city: "Birmingham", country: "GB" },
];

interface PlaceResult {
  geometry?: { location?: { lat?: number; lng?: number } };
  rating?: number;
  name?: string;
  types?: string[];
  vicinity?: string;
}

export async function refreshRestaurantClusters(): Promise<number> {
  const KEY = process.env.GOOGLE_PLACES_API_KEY;
  if (!KEY) {
    logger.warn("GOOGLE_PLACES_API_KEY not set — skipping restaurant cluster refresh");
    return 0;
  }

  let refreshed = 0;

  for (const seed of CLUSTER_SEED_POINTS) {
    const restaurants: PlaceResult[] = [];
    let pageToken: string | undefined;

    try {
      do {
        const res = await gmaps.placesNearby({
          params: {
            location: { lat: seed.lat, lng: seed.lng },
            radius: 1000,
            // @ts-ignore — "restaurant" is a valid PlaceType2 value at runtime
          type: "restaurant" as const,
            key: KEY,
            ...(pageToken ? { pagetoken: pageToken } : {}),
          },
        });

        restaurants.push(...(res.data.results as PlaceResult[]));
        pageToken = res.data.next_page_token;
        if (pageToken) await new Promise((r) => setTimeout(r, 2000));
      } while (pageToken && restaurants.length < 60);

      if (restaurants.length === 0) continue;

      const validRestaurants = restaurants.filter(
        (r) => typeof r.geometry?.location?.lat === "number",
      );
      if (validRestaurants.length === 0) continue;

      const avgLat = validRestaurants.reduce((s, r) => s + (r.geometry!.location!.lat ?? 0), 0) / validRestaurants.length;
      const avgLng = validRestaurants.reduce((s, r) => s + (r.geometry!.location!.lng ?? 0), 0) / validRestaurants.length;
      const densityScore = Math.min(100, Math.round((validRestaurants.length / 60) * 100));

      const topRestaurants = [...validRestaurants]
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 5)
        .map((r) => ({ name: r.name ?? "", rating: r.rating, cuisine: r.types?.[0] }));

      const vicinity = restaurants[0]?.vicinity ?? "";
      const clusterName = `${vicinity.split(",").pop()?.trim() ?? seed.city} Restaurant Hub`;

      await db
        .insert(restaurantClustersTable)
        .values({
          name: clusterName,
          lat: avgLat,
          lng: avgLng,
          radius: 800,
          restaurantCount: validRestaurants.length,
          densityScore,
          city: seed.city,
          country: seed.country,
          topRestaurants,
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      refreshed++;
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      logger.error({ err, city: seed.city, lat: seed.lat, lng: seed.lng }, "Restaurant cluster error");
    }
  }

  return refreshed;
}
