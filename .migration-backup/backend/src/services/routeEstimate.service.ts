import axios from "axios";
import { env } from "../config/env.js";
import { metersToKmText } from "../utils/geospatial.js";

export type RouteEstimateProvider = "google-routes" | "estimated";

export interface RouteEstimate {
  distanceMeters: number;
  distanceText: string;
  durationSeconds: number;
  durationText: string;
  provider: RouteEstimateProvider;
}

interface EstimateInput {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  country?: string | null;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const radiusMeters = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return radiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function parseGoogleDuration(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1])) : null;
}

async function googleRouteEstimate(input: EstimateInput): Promise<RouteEstimate | null> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await axios.post(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: {
          location: {
            latLng: {
              latitude: input.originLat,
              longitude: input.originLng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: input.destinationLat,
              longitude: input.destinationLng
            }
          }
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE"
      },
      {
        timeout: 3500,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
        }
      }
    );

    const route = (response.data as { routes?: Array<{ duration?: unknown; distanceMeters?: unknown }> })
      .routes?.[0];
    const distanceMeters =
      typeof route?.distanceMeters === "number" ? route.distanceMeters : null;
    const durationSeconds = parseGoogleDuration(route?.duration);

    if (distanceMeters === null || durationSeconds === null) {
      return null;
    }

    return {
      distanceMeters,
      distanceText: metersToKmText(distanceMeters),
      durationSeconds,
      durationText: formatDuration(durationSeconds),
      provider: "google-routes"
    };
  } catch {
    return null;
  }
}

function fallbackEstimate(input: EstimateInput): RouteEstimate {
  const straightLineMeters = haversineMeters(
    input.originLat,
    input.originLng,
    input.destinationLat,
    input.destinationLng
  );
  const roadDistanceMeters = straightLineMeters * 1.35;
  const country = input.country?.toLowerCase();
  const averageKmh = country === "nigeria" ? 18 : 28;
  const durationSeconds = (roadDistanceMeters / 1000 / averageKmh) * 3600;

  return {
    distanceMeters: roadDistanceMeters,
    distanceText: metersToKmText(roadDistanceMeters),
    durationSeconds,
    durationText: formatDuration(durationSeconds),
    provider: "estimated"
  };
}

export async function getRouteEstimate(input: EstimateInput): Promise<RouteEstimate> {
  const googleEstimate = await googleRouteEstimate(input);
  return googleEstimate ?? fallbackEstimate(input);
}

