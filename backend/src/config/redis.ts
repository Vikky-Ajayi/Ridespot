import { Redis, type RedisOptions } from "ioredis";
import { env } from "./env.js";

function buildRedisOptions(): RedisOptions {
  const redisUrl = new URL(env.REDIS_URL);

  return {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username || undefined,
    password: redisUrl.password || undefined,
    db: redisUrl.pathname ? Number(redisUrl.pathname.replace("/", "") || 0) : 0,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false
  };
}

export function getRedisConnectionOptions(): RedisOptions {
  return buildRedisOptions();
}

export function createRedisConnection() {
  return new Redis(buildRedisOptions());
}

export const redis = createRedisConnection();
