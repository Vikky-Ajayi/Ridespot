import type { FastifyInstance } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import { createRedisConnection } from "../config/redis.js";
import { AppError } from "../utils/http.js";

export async function registerRateLimit(app: FastifyInstance) {
  await app.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    redis: createRedisConnection(),
    errorResponseBuilder(_request, context) {
      return new AppError(
        context.statusCode,
        "RATE_LIMITED",
        `Rate limit exceeded, retry in ${context.after}`
      );
    }
  });
}
