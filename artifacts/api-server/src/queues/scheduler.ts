import cron from "node-cron";
import { scraperQueue, hotspotQueue } from "./index.js";
import { logger } from "../lib/logger.js";

export function startScheduler(): void {
  if (!scraperQueue || !hotspotQueue) {
    logger.warn("Redis not available — scheduler disabled");
    return;
  }

  // Eventbrite — every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    scraperQueue?.add("eventbrite", {}).catch((err) => logger.error({ err }, "Failed to enqueue eventbrite"));
  });

  // Ticketmaster — every hour
  cron.schedule("5 * * * *", () => {
    scraperQueue?.add("ticketmaster", {}).catch((err) => logger.error({ err }, "Failed to enqueue ticketmaster"));
  });

  // Meetup — every hour
  cron.schedule("15 * * * *", () => {
    scraperQueue?.add("meetup", {}).catch((err) => logger.error({ err }, "Failed to enqueue meetup"));
  });

  // Google Events — every 2 hours
  cron.schedule("0 */2 * * *", () => {
    scraperQueue?.add("google-events", {}).catch((err) => logger.error({ err }, "Failed to enqueue google-events"));
  });

  // Nairaland — every 2 hours
  cron.schedule("30 */2 * * *", () => {
    scraperQueue?.add("nairaland", {}).catch((err) => logger.error({ err }, "Failed to enqueue nairaland"));
  });

  // Facebook — every 4 hours
  cron.schedule("0 */4 * * *", () => {
    scraperQueue?.add("facebook-events", {}).catch((err) => logger.error({ err }, "Failed to enqueue facebook-events"));
  });

  // Restaurant clusters — every 24 hours at 3am
  cron.schedule("0 3 * * *", () => {
    scraperQueue?.add("restaurant-clusters", {}).catch((err) => logger.error({ err }, "Failed to enqueue restaurant-clusters"));
  });

  // Hotspot recalculation — every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    hotspotQueue?.add("recalculate", {}).catch((err) => logger.error({ err }, "Failed to enqueue recalculate"));
  });

  logger.info("[Scheduler] All cron jobs started");
}
