import { Router } from "express";
import { count, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable, hotspotsTable, scraperJobsTable } from "@workspace/db/schema";
import { requireAdmin } from "../middlewares/auth.js";
import { scraperQueue, hotspotQueue } from "../queues/index.js";
import { getSSEClientCount } from "../sse/index.js";

const router = Router();

// All admin routes require x-admin-secret header
router.use(requireAdmin);

// GET /api/admin/scraper-stats
router.get("/scraper-stats", async (_req, res) => {
  try {
    const rows = await db
      .select({ source: eventsTable.source, count: count() })
      .from(eventsTable)
      .groupBy(eventsTable.source);

    const total = rows.reduce((s, r) => s + Number(r.count), 0);
    const jobs = await db.select().from(scraperJobsTable).orderBy(scraperJobsTable.updatedAt);

    res.json({ success: true, data: { bySource: rows, total, scraperJobs: jobs } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
  }
});

// POST /api/admin/trigger-scraper?source=eventbrite
router.post("/trigger-scraper", async (req, res) => {
  const source = (req.query.source as string) ?? "eventbrite";
  if (!scraperQueue) {
    res.status(503).json({ success: false, error: { code: "REDIS_UNAVAILABLE", message: "Queue not available" } });
    return;
  }
  await scraperQueue.add(source, {}, { priority: 1 });
  res.json({ success: true, data: { queued: source } });
});

// GET /api/admin/hotspots/all
router.get("/hotspots/all", async (_req, res) => {
  try {
    const hotspots = await db.select().from(hotspotsTable).orderBy(hotspotsTable.updatedAt);
    res.json({ success: true, data: hotspots });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
  }
});

// GET /api/admin/queue-status
router.get("/queue-status", async (_req, res) => {
  try {
    const [scraperCounts, hotspotCounts] = await Promise.all([
      scraperQueue
        ? Promise.all([scraperQueue.getWaitingCount(), scraperQueue.getActiveCount(), scraperQueue.getFailedCount()])
        : Promise.resolve([0, 0, 0]),
      hotspotQueue
        ? Promise.all([hotspotQueue.getWaitingCount(), hotspotQueue.getActiveCount(), hotspotQueue.getFailedCount()])
        : Promise.resolve([0, 0, 0]),
    ]);

    res.json({
      success: true,
      data: {
        scraper: { waiting: scraperCounts[0], active: scraperCounts[1], failed: scraperCounts[2] },
        hotspot: { waiting: hotspotCounts[0], active: hotspotCounts[1], failed: hotspotCounts[2] },
        sseClients: getSSEClientCount(),
        redisAvailable: Boolean(scraperQueue),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: String(err) } });
  }
});

export default router;
