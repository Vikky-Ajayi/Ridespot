import Fastify from "fastify";
import multipart from "@fastify/multipart";
import jwtPlugin from "./plugins/jwt.js";
import { env } from "./config/env.js";
import { registerCors } from "./plugins/cors.js";
import { registerRateLimit } from "./plugins/rateLimit.js";
import { registerAuthRoutes } from "./modules/auth/auth.routes.js";
import { registerDriverRoutes } from "./modules/driver/driver.routes.js";
import { registerHotspotRoutes } from "./modules/hotspot/hotspot.routes.js";
import { registerEventRoutes } from "./modules/events/events.routes.js";
import { registerAdminRoutes } from "./modules/admin/admin.routes.js";
import { registerPaymentRoutes } from "./modules/payments/payments.routes.js";
import { registerNavigationRoutes } from "./modules/navigation/navigation.routes.js";
import { registerNotificationRoutes } from "./modules/notifications/notifications.routes.js";
import { toErrorResponse } from "./utils/http.js";

function toSerializableDiagnostics(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name
    };
  }

  if (value == null) {
    return undefined;
  }

  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

function getErrorDiagnostics(error: unknown) {
  const err = error as {
    code?: string;
    column?: string;
    constraint?: string;
    details?: unknown;
    message?: string;
    name?: string;
    routine?: string;
    stack?: string;
    table?: string;
  };

  return {
    code: err.code,
    column: err.column,
    constraint: err.constraint,
    details: toSerializableDiagnostics(err.details),
    message: err.message ?? String(error),
    name: err.name,
    routine: err.routine,
    stack: err.stack,
    table: err.table
  };
}

export async function buildApp() {
  const app = Fastify({
    logger: true
  });

  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body.toString("utf8") : body;
    request.rawBody = rawBody;

    if (!rawBody) {
      done(null, {});
      return;
    }

    try {
      done(null, JSON.parse(rawBody));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  await registerCors(app);
  await registerRateLimit(app);
  await app.register(multipart, {
    limits: {
      fileSize: env.ADMIN_OCR_MAX_IMAGE_MB * 1024 * 1024,
      files: 1
    }
  });
  await app.register(jwtPlugin);

  app.setErrorHandler((error, request, reply) => {
    const response = toErrorResponse(error);
    const diagnostics = getErrorDiagnostics(error);

    request.log.error(
      {
        ...diagnostics,
        errorCode: response.payload.error.code,
        statusCode: response.statusCode,
        method: request.method,
        url: request.url
      },
      "request failed"
    );

    console.error(
      JSON.stringify({
        event: "request_failed",
        method: request.method,
        url: request.url,
        statusCode: response.statusCode,
        errorCode: response.payload.error.code,
        ...diagnostics
      })
    );

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
  await app.register(registerNotificationRoutes, { prefix: "/api/notifications" });

  return app;
}
