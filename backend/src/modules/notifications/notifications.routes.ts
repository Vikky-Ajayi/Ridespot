import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { notificationsController } from "./notifications.controller.js";

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authMiddleware }, notificationsController.list);
  app.get(
    "/unread-count",
    { preHandler: authMiddleware },
    notificationsController.unreadCount
  );
  app.patch(
    "/read-all",
    { preHandler: authMiddleware },
    notificationsController.markAllRead
  );
  app.patch(
    "/:id/read",
    { preHandler: authMiddleware },
    notificationsController.markRead
  );
  app.post("/test", { preHandler: authMiddleware }, notificationsController.test);
  app.get(
    "/health",
    {
      preHandler: authMiddleware
    },
    notificationsController.health
  );
}
