import axios from "axios";
import { env } from "../config/env.js";
import type { LatLng } from "../utils/polyline.js";

interface GoogleRouteResponse {
  routes?: Array<{
    duration?: string;
    distanceMeters?: number;
    polyline?: {
      encodedPolyline?: string;
    };
  }>;
}

export interface RouteResult {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  rawResponse: unknown;
}

const googleRoutesClient = axios.create({
  baseURL: "https://routes.googleapis.com",
  timeout: 8000
});

function parseDurationSeconds(duration: string | undefined) {
  if (!duration) {
    return 0;
  }

  const match = duration.match(/^(\d+)s$/);
  return match ? Number(match[1]) : 0;
}

export async function computeGoogleDrivingRoute(
  origin: LatLng,
  destination: LatLng
): Promise<RouteResult | null> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await googleRoutesClient.post<GoogleRouteResponse>(
      "/directions/v2:computeRoutes",
      {
        origin: {
          location: {
            latLng: {
              latitude: origin.lat,
              longitude: origin.lng
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: destination.lat,
              longitude: destination.lng
            }
          }
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "en",
        units: "METRIC"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask":
            "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline"
        }
      }
    );

    const route = response.data.routes?.[0];
    const encodedPolyline = route?.polyline?.encodedPolyline;
    const durationSeconds = parseDurationSeconds(route?.duration);
    const distanceMeters = Number(route?.distanceMeters ?? 0);

    if (!encodedPolyline || !durationSeconds || !distanceMeters) {
      return null;
    }

    return {
      encodedPolyline,
      distanceMeters,
      durationSeconds,
      rawResponse: response.data
    };
  } catch {
    return null;
  }
}
