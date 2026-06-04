import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import { env } from "../config/env.js";

export async function registerCors(app: FastifyInstance) {
  const allowedOrigins = new Set(env.FRONTEND_ORIGINS);

  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
}
