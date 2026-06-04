import type { FastifyReply, FastifyRequest } from "fastify";
import { checkoutSchema } from "./payments.schema.js";
import { paymentsService } from "./payments.service.js";
import { sendSuccess } from "../../utils/http.js";

export const paymentsController = {
  async createCheckout(request: FastifyRequest, reply: FastifyReply) {
    const body = checkoutSchema.parse(request.body);
    const result = await paymentsService.createCheckout(request.user!.sub, body.tier);
    return sendSuccess(reply, result, { statusCode: 201, message: "Checkout created." });
  },

  async getStatus(request: FastifyRequest, reply: FastifyReply) {
    const status = await paymentsService.getStatus(request.user!.sub);
    const token = request.server.signJwt({
      sub: status.driver.id,
      email: status.driver.email,
      planTier: status.driver.planTier,
      country: status.driver.country
    });

    return sendSuccess(reply, {
      ...status,
      token
    });
  },

  async flutterwaveWebhook(request: FastifyRequest, reply: FastifyReply) {
    const result = await paymentsService.processWebhook(
      "flutterwave",
      request.body,
      request.headers["x-flw-signature"]?.toString() ?? null
    );
    return sendSuccess(reply, result);
  },

  async sumupWebhook(request: FastifyRequest, reply: FastifyReply) {
    const result = await paymentsService.processWebhook(
      "sumup",
      request.body,
      request.headers["x-sumup-signature"]?.toString() ?? null
    );
    return sendSuccess(reply, result);
  }
};
