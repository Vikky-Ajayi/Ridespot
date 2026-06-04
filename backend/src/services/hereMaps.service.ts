import axios from "axios";
import { env } from "../config/env.js";

const hereMapsClient = axios.create({
  baseURL: "https://traffic.ls.hereapi.com/traffic/6.3",
  timeout: 10000
});

export async function getTrafficScore(lat: number, lng: number) {
  if (!env.HERE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await hereMapsClient.get("/flow.json", {
      params: {
        apiKey: env.HERE_MAPS_API_KEY,
        prox: `${lat},${lng},300`
      }
    });

    const roadwayCount = Array.isArray(response.data?.RWS) ? response.data.RWS.length : 0;
    return Math.min(20, roadwayCount * 2);
  } catch {
    return null;
  }
}
