import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import { eventsTable, hotspotsTable, restaurantClustersTable } from "@workspace/db/schema";
import { broadcastHotspotUpdate } from "../sse/index.js";
import { logger } from "../lib/logger.js";

const CLUSTER_RADIUS_DEGREES = 0.01; // ~1.1km

interface EventRow {
  id: string;
  venueLat: number;
  venueLng: number;
  title: string;
  expectedAttendance: number | null;
  startTime: Date;
  endTime: Date | null;
  city: string;
  country: string;
}

function groupByProximity(events: EventRow[], radiusDeg = CLUSTER_RADIUS_DEGREES): EventRow[][] {
  const clusters: EventRow[][] = [];
  const used = new Set<number>();

  for (let i = 0; i < events.length; i++) {
    if (used.has(i)) continue;
    const cluster = [events[i]];
    used.add(i);
    for (let j = i + 1; j < events.length; j++) {
      if (used.has(j)) continue;
      const dlat = Math.abs(events[i].venueLat - events[j].venueLat);
      const dlng = Math.abs(events[i].venueLng - events[j].venueLng);
      if (dlat < radiusDeg && dlng < radiusDeg) {
        cluster.push(events[j]);
        used.add(j);
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function scoreCluster(events: EventRow[]): number {
  const now = Date.now();
  let score = 0;
  for (const e of events) {
    const hoursUntil = (e.startTime.getTime() - now) / 3_600_000;
    const timeWeight =
      hoursUntil < 0 ? 1.0
      : hoursUntil < 1 ? 0.95
      : hoursUntil < 2 ? 0.8
      : hoursUntil < 4 ? 0.6
      : hoursUntil < 8 ? 0.35
      : 0.15;
    score += Math.min(e.expectedAttendance ?? 100, 5000) * timeWeight;
  }
  return Math.min(100, Math.round(score / 200));
}

async function recalculateTaxiHotspots(): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 8 * 3_600_000);

  const events = await db
    .select()
    .from(eventsTable)
    .where(
      and(
        gte(eventsTable.startTime, new Date(now.getTime() - 2 * 3_600_000)),
        lte(eventsTable.startTime, windowEnd),
      ),
    );

  if (events.length === 0) return;

  const clusters = groupByProximity(events);

  await db.update(hotspotsTable).set({ isActive: false }).where(eq(hotspotsTable.category, "taxi"));

  for (const cluster of clusters) {
    if (cluster.length === 0) continue;
    const avgLat = cluster.reduce((s, e) => s + e.venueLat, 0) / cluster.length;
    const avgLng = cluster.reduce((s, e) => s + e.venueLng, 0) / cluster.length;
    const score = scoreCluster(cluster);
    if (score < 10) continue;

    const topEvent = [...cluster].sort(
      (a, b) => (b.expectedAttendance ?? 0) - (a.expectedAttendance ?? 0),
    )[0];

    const expiry = new Date(
      Math.max(
        ...cluster.map((e) => e.endTime?.getTime() ?? e.startTime.getTime() + 3_600_000),
      ),
    );

    const name = topEvent.title.length > 40 ? topEvent.title.slice(0, 37) + "…" : topEvent.title;

    await db
      .insert(hotspotsTable)
      .values({
        name,
        lat: avgLat,
        lng: avgLng,
        radius: 600 + cluster.length * 50,
        intensityScore: score,
        category: "taxi",
        city: topEvent.city,
        country: topEvent.country,
        driverSaturation: score > 75 ? "LOW" : score > 50 ? "MEDIUM" : "HIGH",
        demandRequests: score > 75 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW",
        demandLabel:
          score > 75
            ? "Very high demand expected"
            : score > 40
              ? "Demand increase likely"
              : "Moderate demand",
        driveTimeMinutes: 10,
        distanceKm: 5,
        timeStart: topEvent.startTime.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        timeEnd:
          topEvent.endTime?.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          }) ?? "",
        activeEvents: cluster
          .slice(0, 5)
          .map((e) => ({ id: e.id, title: e.title, startTime: e.startTime.toISOString() })),
        expiryTimestamp: expiry,
        isActive: true,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

async function recalculateDeliveryHotspots(): Promise<void> {
  const clusters = await db.select().from(restaurantClustersTable);

  await db
    .update(hotspotsTable)
    .set({ isActive: false })
    .where(eq(hotspotsTable.category, "delivery"));

  for (const cluster of clusters) {
    const score = cluster.densityScore ?? 0;
    if (score < 10) continue;

    await db
      .insert(hotspotsTable)
      .values({
        name: cluster.name,
        lat: cluster.lat,
        lng: cluster.lng,
        radius: cluster.radius,
        intensityScore: score,
        category: "delivery",
        city: cluster.city,
        country: cluster.country,
        driverSaturation: score > 75 ? "LOW" : "MEDIUM",
        demandRequests: score > 60 ? "HIGH" : "MEDIUM",
        demandLabel: `${cluster.restaurantCount ?? 0} restaurants in this area`,
        driveTimeMinutes: 8,
        distanceKm: 4,
        activeEvents: [] as Array<{ id: string; title: string; startTime: string }>,
        isActive: true,
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

export async function runHotspotRecalculation(): Promise<void> {
  try {
    await Promise.all([recalculateTaxiHotspots(), recalculateDeliveryHotspots()]);
    const hotspots = await db
      .select()
      .from(hotspotsTable)
      .where(eq(hotspotsTable.isActive, true));
    broadcastHotspotUpdate(hotspots);
    logger.info({ count: hotspots.length }, "Hotspot recalculation complete");
  } catch (err) {
    logger.error({ err }, "Hotspot recalculation failed");
  }
}
