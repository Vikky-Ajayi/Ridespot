import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { planGuard } from "../../middleware/planGuard.middleware.js";
import { eventsController } from "./events.controller.js";

export async function registerEventRoutes(app: FastifyInstance) {
  app.get(
    "/nearby",
    {
      preHandler: [authMiddleware]
    },
    eventsController.nearby
  );

  app.post(
    "/ingest",
    {
      preHandler: [authMiddleware, planGuard("fleet")]
    },
    eventsController.ingest
  );
}
