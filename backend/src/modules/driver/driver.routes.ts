import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { driverController } from "./driver.controller.js";

export async function registerDriverRoutes(app: FastifyInstance) {
  app.get("/profile", { preHandler: authMiddleware }, driverController.getProfile);
  app.put("/profile", { preHandler: authMiddleware }, driverController.updateProfile);
  app.put("/password", { preHandler: authMiddleware }, driverController.updatePassword);
  app.get(
    "/notifications/preferences",
    { preHandler: authMiddleware },
    driverController.getNotificationPreferences
  );
  app.put(
    "/notifications/preferences",
    { preHandler: authMiddleware },
    driverController.updateNotificationPreferences
  );
  app.post(
    "/notifications/fcm-token",
    { preHandler: authMiddleware },
    driverController.saveFcmToken
  );
  app.post("/feedback", { preHandler: authMiddleware }, driverController.submitFeedback);
}
