import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";
import {
  navigationSessionBodySchema,
  navigationSessionIdSchema
} from "./navigation.schema.js";
import { navigationService } from "./navigation.service.js";

export const navigationController = {
  async start(request: FastifyRequest, reply: FastifyReply) {
    const body = navigationSessionBodySchema.parse(request.body);
    const session = await navigationService.start(request.user!.sub, body);
    return sendSuccess(reply, session, { statusCode: 201 });
  },

  async active(request: FastifyRequest, reply: FastifyReply) {
    const session = await navigationService.getActive(request.user!.sub);
    return sendSuccess(reply, session);
  },

  async cancel(request: FastifyRequest, reply: FastifyReply) {
    const params = navigationSessionIdSchema.parse(request.params);
    const session = await navigationService.cancel(request.user!.sub, params.id);
    return sendSuccess(reply, session);
  },

  async complete(request: FastifyRequest, reply: FastifyReply) {
    const params = navigationSessionIdSchema.parse(request.params);
    const session = await navigationService.complete(request.user!.sub, params.id);
    return sendSuccess(reply, session);
  }
};
