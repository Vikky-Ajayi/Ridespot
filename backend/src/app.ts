import Fastify from "fastify";
import jwtPlugin from "./plugins/jwt.js";
import { registerCors } from "./plugins/cors.js";
import { registerRateLimit } from "./plugins/rateLimit.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerDriverRoutes } from "./modules/driver/driver.routes.js";
import { registerHotspotRoutes } from "./modules/hotspot/hotspot.routes.js";
import { registerEventRoutes } from "./modules/events/events.routes.js";
import { registerAdminRoutes } from "./modules/admin/admin.routes.js";
import { registerPaymentRoutes } from "./modules/payments/payments.routes.js";
import { registerNavigationRoutes } from "./modules/navigation/navigation.routes.js";
import { toErrorResponse } from "./utils/http.js";

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  await registerCors(app);
  await registerRateLimit(app);
  await app.register(jwtPlugin);

  app.setErrorHandler((error, _request, reply) => {
    const response = toErrorResponse(error);
    reply.code(response.statusCode).send(response.payload);
  });

  app.get("/health", async () => ({
    success: true,
    data: {
      status: "ok"
    }
  }));

  await app.register(registerAuthRoutes, { prefix: "/api/auth" });
  await app.register(registerDriverRoutes, { prefix: "/api/driver" });
  await app.register(registerHotspotRoutes, { prefix: "/api/hotspots" });
  await app.register(registerEventRoutes, { prefix: "/api/events" });
  await app.register(registerAdminRoutes, { prefix: "/api/admin" });
  await app.register(registerPaymentRoutes, { prefix: "/api/payments" });
  await app.register(registerNavigationRoutes, { prefix: "/api/navigation" });

  return app;
}
