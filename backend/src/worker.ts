import { db, verifyDatabaseConnection } from "./config/database.js";
import { redis } from "./config/redis.js";
import { createEventIngestionWorker, ensureEventIngestionSchedule } from "./jobs/eventIngestion.job.js";
import { createHotspotRefreshWorker, ensureHotspotRefreshSchedule } from "./jobs/hotspotRefresh.job.js";
import { createMlPredictionWorker } from "./jobs/mlPrediction.job.js";
import {
  createRestaurantClusterWorker,
  ensureRestaurantClusterSchedule
} from "./jobs/restaurantClusterRefresh.job.js";
import {
  createEventbriteSitemapWorker,
  ensureEventbriteSitemapSchedule
} from "./jobs/eventbriteSitemapCrawl.job.js";

async function startWorkers() {
  await verifyDatabaseConnection();
  await ensureEventIngestionSchedule();
  await ensureHotspotRefreshSchedule();
  await ensureRestaurantClusterSchedule();
  await ensureEventbriteSitemapSchedule();

  const workers = [
    createEventIngestionWorker(),
    createHotspotRefreshWorker(),
    createMlPredictionWorker(),
    createRestaurantClusterWorker(),
    createEventbriteSitemapWorker()
  ];

  const shutdown = async () => {
    await Promise.all(workers.map((worker) => worker.close()));
    await db.end();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

void startWorkers().catch((error) => {
  console.error(error);
  process.exit(1);
});
