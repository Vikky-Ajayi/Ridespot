import { Worker } from "bullmq";
import { redisConnection } from "../queues/index.js";
import { runEventbriteScraper } from "./scrapers/eventbrite.js";
import { runTicketmasterScraper } from "./scrapers/ticketmaster.js";
import { runMeetupScraper } from "./scrapers/meetup.js";
import { runGoogleEventsScraper } from "./scrapers/google-events.js";
import { runNairalandScraper } from "./scrapers/nairaland.js";
import { runFacebookEventsScraper } from "./scrapers/facebook-events.js";
import { refreshRestaurantClusters } from "./restaurant-clusters.js";
import { runHotspotRecalculation } from "./hotspot-engine.js";
import { logger } from "../lib/logger.js";

export function startWorkers(): void {
  if (!redisConnection) {
    logger.warn("Redis not available — workers disabled");
    return;
  }

  const scraperFns: Record<string, () => Promise<number>> = {
    eventbrite: runEventbriteScraper,
    ticketmaster: runTicketmasterScraper,
    meetup: runMeetupScraper,
    "google-events": runGoogleEventsScraper,
    nairaland: runNairalandScraper,
    "facebook-events": runFacebookEventsScraper,
    "restaurant-clusters": refreshRestaurantClusters,
  };

  const scraperWorker = new Worker(
    "scraper",
    async (job) => {
      const fn = scraperFns[job.name];
      if (!fn) throw new Error(`Unknown scraper: ${job.name}`);
      const count = await fn();
      logger.info({ job: job.name, count }, "Scraper finished");
      return count;
    },
    { connection: redisConnection, concurrency: 3 },
  );

  const hotspotWorker = new Worker(
    "hotspot",
    async () => {
      await runHotspotRecalculation();
    },
    { connection: redisConnection, concurrency: 1 },
  );

  scraperWorker.on("failed", (job, err) =>
    logger.error({ job: job?.name, err: err.message }, "Scraper worker failed"),
  );
  hotspotWorker.on("failed", (job, err) =>
    logger.error({ job: job?.name, err: err.message }, "Hotspot worker failed"),
  );

  logger.info("Scraper and hotspot workers started");
}
