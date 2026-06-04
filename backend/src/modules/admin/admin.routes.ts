import type { FastifyInstance } from "fastify";
import { adminMiddleware } from "../../middleware/admin.middleware.js";
import { adminController } from "./admin.controller.js";

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes"
        }
      }
    },
    adminController.login
  );

  app.get("/config/markets", { preHandler: adminMiddleware }, adminController.getMarketConfigs);
  app.put<{ Params: { city: string } }>(
    "/config/markets/:city",
    { preHandler: adminMiddleware },
    adminController.updateMarketConfig
  );

  app.get("/drivers/online", { preHandler: adminMiddleware }, adminController.getOnlineDrivers);
  app.get("/hotspots/active", { preHandler: adminMiddleware }, adminController.getActiveHotspots);
  app.get(
    "/notifications/logs",
    { preHandler: adminMiddleware },
    adminController.getNotificationLogs
  );
  app.get("/ml/status", { preHandler: adminMiddleware }, adminController.getMlStatus);
  app.post("/ml/retrain", { preHandler: adminMiddleware }, adminController.triggerMlRetrain);

  app.get("/events", { preHandler: adminMiddleware }, adminController.listEvents);
  app.post("/events", { preHandler: adminMiddleware }, adminController.createEvent);
  app.put<{ Params: { id: string } }>(
    "/events/:id",
    { preHandler: adminMiddleware },
    adminController.updateEvent
  );
  app.delete<{ Params: { id: string } }>(
    "/events/:id",
    { preHandler: adminMiddleware },
    adminController.deleteEvent
  );
}
