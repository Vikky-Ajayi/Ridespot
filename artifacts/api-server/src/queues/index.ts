import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../lib/logger.js";

function createRedisConnection() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn("REDIS_URL not set — BullMQ queues disabled");
    return null;
  }
  const conn = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true });
  conn.on("error", (err) => logger.error({ err }, "Redis connection error"));
  return conn;
}

export const redisConnection = createRedisConnection();

function makeQueue(name: string) {
  if (!redisConnection) return null;
  return new Queue(name, {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
}

export const scraperQueue = makeQueue("scraper");
export const hotspotQueue = (() => {
  if (!redisConnection) return null;
  return new Queue("hotspot", {
    connection: redisConnection,
    defaultJobOptions: { attempts: 2, removeOnComplete: 10, removeOnFail: 10 },
  });
})();
