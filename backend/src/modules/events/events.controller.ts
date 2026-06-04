import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { eventsService } from "./events.service.js";
import { manualIngestionSchema } from "./events.schema.js";

export const eventsController = {
  async ingest(request: FastifyRequest, reply: FastifyReply) {
    const body = manualIngestionSchema.parse(request.body ?? {});
    const cities = body.cities?.map((city) => ({ city, countryCode: "GB" as const }));
    const result = await eventsService.ingestEvents(cities);
    return sendSuccess(reply, result, { message: "Event ingestion completed." });
  }
};
