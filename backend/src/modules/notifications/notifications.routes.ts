import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { planGuard } from "../../middleware/planGuard.middleware.js";
import { notificationsController } from "./notifications.controller.js";

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get(
    "/health",
    {
      preHandler: [authMiddleware, planGuard("fleet")]
    },
    notificationsController.health
  );
}
