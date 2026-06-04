import axios from "axios";
import { env } from "../config/env.js";

const googlePlacesClient = axios.create({
  baseURL: "https://maps.googleapis.com/maps/api/place",
  timeout: 10000
});

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
