import axios from "axios";
import { env } from "../config/env.js";
import type { EventInput } from "../utils/normalise.js";

const googlePlacesClient = axios.create({
  baseURL: "https://maps.googleapis.com/maps/api/place",
  timeout: 10000
});

const DEMAND_PLACE_TYPES = [
  "night_club",
  "bar",
  "restaurant",
  "shopping_mall",
  "stadium",
  "movie_theater"
] as const;

export async function getGooglePlacesPopularity(lat: number, lng: number) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const nearby = await googlePlacesClient.get("/nearbysearch/json", {
      params: {
        key: env.GOOGLE_MAPS_API_KEY,
        location: `${lat},${lng}`,
        radius: 300
      }
    });

    return Array.isArray(nearby.data?.results) ? Math.min(20, nearby.data.results.length * 2) : null;
  } catch {
    return null;
  }
}

function placeAttendanceProxy(place: Record<string, unknown>, placeType: string) {
  const ratings = typeof place.user_ratings_total === "number" ? place.user_ratings_total : 0;
  const baseByType: Record<string, number> = {
    night_club: 700,
    bar: 450,
    restaurant: 300,
    shopping_mall: 1200,
    stadium: 2500,
    movie_theater: 500,
  };
  const ratingBoost = Math.min(1200, Math.round(Math.log1p(ratings) * 120));
  return (baseByType[placeType] ?? 400) + ratingBoost;
}

function eventWindowForOpenPlace() {
  const now = new Date();
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return { startTime: now, endTime: end };
}

function compactPlaceAddress(place: Record<string, unknown>) {
  const vicinity = typeof place.vicinity === "string" ? place.vicinity : null;
  const address = typeof place.formatted_address === "string" ? place.formatted_address : null;
  return vicinity ?? address;
}

export async function fetchGooglePlaceDemandEventsNear(input: {
  lat: number;
  lng: number;
  radiusMeters: number;
  city?: string | null;
  country?: string | null;
}) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return [] as EventInput[];
  }

  const uniquePlaces = new Map<string, { place: Record<string, unknown>; type: string }>();
  const radius = Math.min(15000, Math.max(1000, input.radiusMeters));

  await Promise.all(
    DEMAND_PLACE_TYPES.map(async (type) => {
      try {
        const response = await googlePlacesClient.get("/nearbysearch/json", {
          params: {
            key: env.GOOGLE_MAPS_API_KEY,
            location: `${input.lat},${input.lng}`,
            radius,
            type,
            opennow: true
          },
          timeout: 12000,
          validateStatus: () => true
        });

        const places: Array<Record<string, unknown>> = Array.isArray(response.data?.results)
          ? response.data.results
          : [];

        for (const place of places) {
          const placeId = typeof place.place_id === "string" ? place.place_id : null;
          const ratings = typeof place.user_ratings_total === "number" ? place.user_ratings_total : 0;
          if (!placeId || ratings < 25) {
            continue;
          }

          uniquePlaces.set(placeId, { place, type });
        }
      } catch (error) {
        console.warn(
          JSON.stringify({
            event: "google_places_demand_type_failed",
            type,
            message: error instanceof Error ? error.message : String(error)
          })
        );
      }
    })
  );

  const bucket = new Date().toISOString().slice(0, 13);
  const events = Array.from(uniquePlaces.values())
    .map<EventInput | null>(({ place, type }) => {
      const geometry = place.geometry as Record<string, unknown> | undefined;
      const location = geometry?.location as Record<string, unknown> | undefined;
      const lat = typeof location?.lat === "number" ? location.lat : Number.NaN;
      const lng = typeof location?.lng === "number" ? location.lng : Number.NaN;
      const placeId = typeof place.place_id === "string" ? place.place_id : null;
      const name = typeof place.name === "string" ? place.name : null;
      if (!placeId || !name || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null;
      }

      const { startTime, endTime } = eventWindowForOpenPlace();
      const event: EventInput = {
        externalId: `${placeId}:${bucket}`,
        source: "google_places",
        name,
        venueName: name,
        lat,
        lng,
        address: compactPlaceAddress(place),
        city: input.city ?? "Unknown",
        country: input.country ?? "Unknown",
        startTime,
        endTime,
        expectedAttendance: placeAttendanceProxy(place, type),
        eventType: "Live Place Activity",
        eventCategory: type.replace(/_/g, " "),
        rawData: {
          ...place,
          demandPlaceType: type,
          ingestionSource: "google_places_open_now"
        }
      };

      return event;
    })
    .filter((event): event is EventInput => event !== null)
    .sort((a, b) => (b.expectedAttendance ?? 0) - (a.expectedAttendance ?? 0))
    .slice(0, 30);

  console.info(
    JSON.stringify({
      event: "google_places_demand_events_fetched",
      lat: input.lat,
      lng: input.lng,
      radiusMeters: radius,
      placeCount: uniquePlaces.size,
      eventCount: events.length
    })
  );

  return events;
}
