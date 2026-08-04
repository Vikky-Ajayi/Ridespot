import { Router } from "express";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { hotspotsTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";
import { addSSEClient } from "../sse/index.js";

const router = Router();

// Map a DB hotspot row to the BackendHotspot shape the frontend expects
function toBackendHotspot(h: typeof hotspotsTable.$inferSelect) {
  const score = h.intensityScore ?? 0;
  const demandLevel =
    score >= 75 ? "very-high"
    : score >= 50 ? "high"
    : score >= 25 ? "medium"
    : "low";

  return {
    id: h.id,
    name: h.name,
    lat: h.lat,
    lng: h.lng,
    location: { lat: h.lat, lng: h.lng },
    radius_meters: h.radius,
    demandLevel,
    demandScore: score,
    liveScore: score,
    intensityScore: score,
    category: h.category,
    city: h.city,
    country: h.country,
    driverSaturation: h.driverSaturation ?? "LOW",
    insightText: h.demandLabel ?? "Strong rider activity expected in this area.",
    driveTimeText: h.driveTimeMinutes ? `${h.driveTimeMinutes} min away` : "ETA unavailable",
    distanceText: h.distanceKm ? `${h.distanceKm} km away` : "Distance unavailable",
    timeRange: h.timeStart && h.timeEnd ? `${h.timeStart} - ${h.timeEnd}` : "Time TBC",
    activeTimeStart: h.timeStart ?? null,
    activeTimeEnd: h.timeEnd ?? null,
    imageUrl: null,
    source: "hotspot-engine",
    isActive: h.isActive,
    expiryTimestamp: h.expiryTimestamp?.toISOString() ?? null,
    activeEvents: h.activeEvents ?? [],
    generatedAt: h.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// GET /api/hotspots/stream — SSE real-time subscription
router.get("/stream", requireAuth, (req: AuthRequest, res) => {
  addSSEClient(res);
  // Send current hotspots immediately on connect
  db.select()
    .from(hotspotsTable)
    .where(eq(hotspotsTable.isActive, true))
    .then((hotspots) => {
      const payload = hotspots.map(toBackendHotspot);
      res.write(
        `data: ${JSON.stringify({ type: "hotspots_update", data: payload, ts: Date.now() })}\n\n`,
      );
    })
    .catch(() => {/* client may have disconnected */});
});

// GET /api/hotspots — DB-backed HTTP fallback
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { lat, lng, radius, limit = "20", category } = req.query as Record<string, string>;

    // Build where conditions
    const conditions = [eq(hotspotsTable.isActive, true)];

    if (category) {
      conditions.push(eq(hotspotsTable.category, category));
    }

    if (lat && lng && radius) {
      const radiusMeters = parseFloat(radius);
      const latF = parseFloat(lat);
      const lngF = parseFloat(lng);
      const degLat = radiusMeters / 111_320;
      const degLng = radiusMeters / (111_320 * Math.cos((latF * Math.PI) / 180));
      conditions.push(
        sql`${hotspotsTable.lat} BETWEEN ${latF - degLat} AND ${latF + degLat}`,
        sql`${hotspotsTable.lng} BETWEEN ${lngF - degLng} AND ${lngF + degLng}`,
      );
    }

    const rows = await db
      .select()
      .from(hotspotsTable)
      .where(and(...conditions))
      .limit(parseInt(limit, 10));

    const hotspots = rows.map(toBackendHotspot);

    res.json({
      success: true,
      data: {
        hotspots,
        total: hotspots.length,
        generatedAt: new Date().toISOString(),
        requestedRadiusMeters: parseFloat(radius ?? "15000"),
        effectiveRadiusMeters: parseFloat(radius ?? "15000"),
      },
    });
  } catch (err) {
    req.log.error({ err }, "GET /hotspots failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch hotspots" } });
  }
});

// GET /api/hotspots/:id
router.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [hotspot] = await db
      .select()
      .from(hotspotsTable)
      .where(eq(hotspotsTable.id, String(req.params["id"])))
      .limit(1);

    if (!hotspot) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Hotspot not found" } });
      return;
    }

    res.json({ success: true, data: toBackendHotspot(hotspot) });
  } catch (err) {
    req.log.error({ err }, "GET /hotspots/:id failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch hotspot" } });
  }
});

export default router;
