import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { paymentsController } from "./payments.controller.js";

export async function registerPaymentRoutes(app: FastifyInstance) {
  app.post("/checkout", { preHandler: authMiddleware }, paymentsController.createCheckout);
  app.get("/status", { preHandler: authMiddleware }, paymentsController.getStatus);
  app.post("/webhooks/flutterwave", paymentsController.flutterwaveWebhook);
  app.post("/webhooks/sumup", paymentsController.sumupWebhook);
}
