import type { FastifyReply, FastifyRequest } from "fastify";
import { sendSuccess } from "../../utils/http.js";

export const notificationsController = {
  async health(_request: FastifyRequest, reply: FastifyReply) {
    return sendSuccess(reply, { status: "ok" });
  }
};
