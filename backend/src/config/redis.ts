import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env.js";

function buildRedisOptions(): RedisOptions {
  const redisUrl = new URL(env.REDIS_URL);
  const useTls = redisUrl.protocol === "rediss:";

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname ? Number(redisUrl.pathname.replace("/", "") || 0) : 0,
    tls: useTls ? {} : undefined,
    family: 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false
  };
}

export function getRedisConnectionOptions(): RedisOptions {
  return buildRedisOptions();
}

function logRedisError(label: string, error: unknown) {
  const err = error as { code?: string; hostname?: string; message?: string };
  console.error(`[redis:${label}] connection error`, {
    code: err.code,
    hostname: err.hostname,
    message: err.message ?? String(error)
  });
}

export function createRedisConnection(label = "default") {
  const client = new Redis(buildRedisOptions());
  client.on("error", (error) => logRedisError(label, error));
  return client;
}

export const redis = createRedisConnection("shared");
