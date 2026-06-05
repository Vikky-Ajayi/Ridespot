import axios from "axios";
import { env } from "../config/env.js";

const hereMapsClient = axios.create({
  baseURL: "https://data.traffic.hereapi.com/v7",
  timeout: 10000
});

function trafficScoreFromFlowResults(results: unknown) {
  if (!Array.isArray(results) || !results.length) {
    return null;
  }

  const jamFactors = results
    .map((item) => {
      const flow = item && typeof item === "object" ? (item as { currentFlow?: unknown }) : {};
      const currentFlow =
        flow.currentFlow && typeof flow.currentFlow === "object"
          ? (flow.currentFlow as { jamFactor?: unknown })
          : {};
      return typeof currentFlow.jamFactor === "number" ? currentFlow.jamFactor : null;
    })
    .filter((value): value is number => value !== null);

  if (!jamFactors.length) {
    return null;
  }

  const averageJamFactor =
    jamFactors.reduce((total, value) => total + value, 0) / jamFactors.length;

  return Math.min(20, Math.max(0, Math.round(averageJamFactor * 2)));
}

export async function getTrafficScore(lat: number, lng: number) {
  if (!env.HERE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await hereMapsClient.get("/flow", {
      params: {
        apiKey: env.HERE_MAPS_API_KEY,
        in: `circle:${lat},${lng};r=300`,
        locationReferencing: "none"
      }
    });

    return trafficScoreFromFlowResults(response.data?.results);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown HERE Maps error";
    console.warn(
      JSON.stringify({
        event: "here_maps_traffic_unavailable",
        message
      })
    );
    return null;
  }
}
