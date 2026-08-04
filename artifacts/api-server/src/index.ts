import app from "./app.js";
import { logger } from "./lib/logger.js";
import { startWorkers } from "./workers/index.js";
import { startScheduler } from "./queues/scheduler.js";
import { scraperQueue, hotspotQueue } from "./queues/index.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start background workers and cron scheduler (no-ops if Redis not configured)
  startWorkers();
  startScheduler();

  // Seed initial jobs on first boot if queues are empty
  if (scraperQueue && hotspotQueue) {
    try {
      const [scraperCount, hotspotCount] = await Promise.all([
        scraperQueue.count(),
        hotspotQueue.count(),
      ]);

      if (scraperCount === 0) {
        await Promise.all([
          scraperQueue.add("eventbrite", {}),
          scraperQueue.add("ticketmaster", {}),
          scraperQueue.add("meetup", {}),
          scraperQueue.add("restaurant-clusters", {}),
        ]);
        logger.info("Seeded initial scraper jobs");
      }

      if (hotspotCount === 0) {
        await hotspotQueue.add("recalculate", {});
        logger.info("Seeded initial hotspot recalculation job");
      }
    } catch (err) {
      logger.warn({ err }, "Failed to seed initial jobs (Redis may not be ready yet)");
    }
  }
});
