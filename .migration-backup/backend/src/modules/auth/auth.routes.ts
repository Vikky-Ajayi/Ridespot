import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { authController } from "./auth.controller.js";

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 hour"
        }
      }
    },
    authController.register
  );

  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes"
        }
      }
    },
    authController.login
  );

  app.post("/verify-email", authController.verifyEmail);
  app.post("/resend-otp", authController.resendOtp);
  app.post(
    "/forgot-password",
    {
      config: {
        rateLimit: {
          max: 3,
          timeWindow: "1 hour"
        }
      }
    },
    authController.forgotPassword
  );
  app.post("/reset-password", authController.resetPassword);
  app.post("/logout", authController.logout);
  app.get("/me", { preHandler: authMiddleware }, authController.me);
}
