import { Router } from "express";
import { and, gte, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

// GET /api/events/nearby — return upcoming events near a location as hotspot-shaped data
router.get("/nearby", requireAuth, async (req: AuthRequest, res) => {
  try {
    const {
      lat,
      lng,
      radius = "15000",
      days = "3",
      limit = "50",
    } = req.query as Record<string, string>;

    if (!lat || !lng) {
      res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "lat and lng are required" } });
      return;
    }

    const latF = parseFloat(lat);
    const lngF = parseFloat(lng);
    const radiusMeters = parseFloat(radius);
    const daysNum = parseInt(days, 10);
    const limitNum = parseInt(limit, 10);

    const degLat = radiusMeters / 111_320;
    const degLng = radiusMeters / (111_320 * Math.cos((latF * Math.PI) / 180));

    const now = new Date();
    const windowEnd = new Date(now.getTime() + daysNum * 24 * 3_600_000);

    const events = await db
      .select()
      .from(eventsTable)
      .where(
        and(
          gte(eventsTable.startTime, now),
          lte(eventsTable.startTime, windowEnd),
          sql`${eventsTable.venueLat} BETWEEN ${latF - degLat} AND ${latF + degLat}`,
          sql`${eventsTable.venueLng} BETWEEN ${lngF - degLng} AND ${lngF + degLng}`,
        ),
      )
      .orderBy(eventsTable.startTime)
      .limit(limitNum);

    // Map events to BackendHotspot shape for the frontend
    const mapped = events.map((e) => {
      const attendance = e.expectedAttendance ?? 100;
      const score = Math.min(100, Math.round(attendance / 50));
      const demandLevel =
        score >= 75 ? "very-high"
        : score >= 50 ? "high"
        : score >= 25 ? "medium"
        : "low";

      return {
        id: e.id,
        name: e.title,
        lat: e.venueLat,
        lng: e.venueLng,
        location: { lat: e.venueLat, lng: e.venueLng },
        demandLevel,
        demandScore: score,
        liveScore: score,
        city: e.city,
        country: e.country,
        driverSaturation: "MEDIUM",
        insightText: `${e.title} — expect surge demand`,
        driveTimeText: "ETA unavailable",
        distanceText: "Distance unavailable",
        timeRange: e.startTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
        activeTimeStart: e.startTime.toISOString(),
        activeTimeEnd: e.endTime?.toISOString() ?? null,
        imageUrl: e.imageUrl ?? null,
        source: e.source,
        sourceUrl: e.eventUrl ?? null,
        venueName: e.venueName ?? null,
        category: e.category ?? null,
        generatedAt: new Date().toISOString(),
      };
    });

    res.json({
      success: true,
      data: {
        events: mapped,
        hotspots: mapped,
        total: mapped.length,
        generatedAt: new Date().toISOString(),
        requestedRadiusMeters: radiusMeters,
        effectiveRadiusMeters: radiusMeters,
        targetCount: limitNum,
        returnedCount: mapped.length,
        days: daysNum,
        liveWindow: "next_3_days",
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /events/nearby failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch nearby events" } });
  }
});

export default router;
