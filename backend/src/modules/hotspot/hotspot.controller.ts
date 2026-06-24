import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import { hotspotIdSchema, hotspotQuerySchema } from "./hotspot.schema.js";
import { hotspotService } from "./hotspot.service.js";

export const hotspotController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    const queryParams = hotspotQuerySchema.parse(request.query);
    const data = await hotspotService.getHotspots({
      ...queryParams,
      planTier: request.user!.planTier
    });

    return sendSuccess(reply, data);
  },

  async getById(request: FastifyRequest, reply: FastifyReply) {
    const params = hotspotIdSchema.parse(request.params);
    const hotspot = await hotspotService.getHotspotById(params.id);
    return sendSuccess(reply, hotspot);
  },

  async demandByHour(request: FastifyRequest, reply: FastifyReply) {
    const params = hotspotIdSchema.parse(request.params);
    const data = await hotspotService.getDemandByHour(params.id);
    return sendSuccess(reply, data);
  },

  async navigate(request: FastifyRequest, reply: FastifyReply) {
    const params = hotspotIdSchema.parse(request.params);
    await hotspotService.navigate(request.user!.sub, params.id);
    return sendSuccess(reply, {}, { message: "Navigation intent logged." });
  }
};
