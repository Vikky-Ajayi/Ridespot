import type { FastifyInstance } from "fastify";
import fastifyCors from "@fastify/cors";
import { env } from "../config/env.js";

export async function registerCors(app: FastifyInstance) {
  await app.register(fastifyCors, {
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
}
