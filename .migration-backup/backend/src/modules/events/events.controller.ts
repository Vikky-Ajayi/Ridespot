import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { eventsService } from "./events.service.js";
import { manualIngestionSchema, nearbyEventsQuerySchema } from "./events.schema.js";

type IngestionCityConfig = {
  city: string;
  country: "Nigeria" | "UK";
  countryCode: "GB" | "NG";
  lat: number;
  lng: number;
};

const INGESTION_CITY_MAP: Record<string, IngestionCityConfig> = {
  lagos: { city: "Lagos", country: "Nigeria", countryCode: "NG", lat: 6.5244, lng: 3.3792 },
  abuja: { city: "Abuja", country: "Nigeria", countryCode: "NG", lat: 9.0765, lng: 7.3986 },
  london: { city: "London", country: "UK", countryCode: "GB", lat: 51.5072, lng: -0.1276 },
  manchester: { city: "Manchester", country: "UK", countryCode: "GB", lat: 53.4808, lng: -2.2426 },
  birmingham: { city: "Birmingham", country: "UK", countryCode: "GB", lat: 52.4862, lng: -1.8904 }
};

export const eventsController = {
  async ingest(request: FastifyRequest, reply: FastifyReply) {
    const body = manualIngestionSchema.parse(request.body ?? {});
    const cities = body.cities
      ?.map((city) => INGESTION_CITY_MAP[city.trim().toLowerCase()])
      .filter((city): city is NonNullable<typeof city> => Boolean(city));
    const result = await eventsService.ingestEvents(cities);
    return sendSuccess(reply, result, { message: "Event ingestion completed." });
  },

  async nearby(request: FastifyRequest, reply: FastifyReply) {
    const query = nearbyEventsQuerySchema.parse(request.query);
    return sendSuccess(reply, await eventsService.getNearbyEvents(query));
  }
};
