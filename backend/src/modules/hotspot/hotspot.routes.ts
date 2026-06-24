import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { hotspotController } from "./hotspot.controller.js";

export async function registerHotspotRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: authMiddleware }, hotspotController.list);
  app.get("/:id", { preHandler: authMiddleware }, hotspotController.getById);
  app.get(
    "/:id/demand-by-hour",
    { preHandler: authMiddleware },
    hotspotController.demandByHour
  );
  app.post("/:id/navigate", { preHandler: authMiddleware }, hotspotController.navigate);
}
