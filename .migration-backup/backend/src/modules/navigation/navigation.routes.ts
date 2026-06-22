import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { navigationController } from "./navigation.controller.js";

export async function registerNavigationRoutes(app: FastifyInstance) {
  app.post("/sessions", { preHandler: authMiddleware }, navigationController.start);
  app.get("/sessions/active", { preHandler: authMiddleware }, navigationController.active);
  app.patch(
    "/sessions/:id/cancel",
    { preHandler: authMiddleware },
    navigationController.cancel
  );
  app.patch(
    "/sessions/:id/complete",
    { preHandler: authMiddleware },
    navigationController.complete
  );
}
