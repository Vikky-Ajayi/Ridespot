import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:hotspot-refresh timed out");
  process.exit(1);
}, 60000);

const imports = {
  database: await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href),
  redis: await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href),
  job: await import(pathToFileURL(resolve(backendRoot, "dist/jobs/hotspotRefresh.job.js")).href)
};

const { db, query, verifyDatabaseConnection } = imports.database;
const { redis } = imports.redis;
const { runHotspotRefreshCycle } = imports.job;

const eventId = randomUUID();
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  await verifyDatabaseConnection();

  await query(
    `INSERT INTO events (
       id, external_id, source, name, venue_name, location, address, city, country,
       start_time, end_time, expected_attendance, event_type, event_category, is_active
     ) VALUES (
       $1, $2, 'manual', 'Hotspot Refresh Smoke Event', 'Refresh Smoke Venue',
       ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
       'Wembley', 'London', 'UK', NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '2 hours',
       3200, 'Concert', 'Entertainment', TRUE
     )`,
    [eventId, `hotspot-refresh-${Date.now()}`, -0.2792, 51.5562]
  );

  const result = await runHotspotRefreshCycle();

  const hotspot = await query(
    `SELECT
       h.id,
       h.demand_level,
       h.demand_score,
       h.drivers_needed,
       h.radius_meters,
       h.insight_text,
       h.is_active
     FROM hotspots h
     WHERE h.event_id = $1`,
    [eventId]
  );

  assert(hotspot.rowCount === 1, "Hotspot refresh did not create an event-backed hotspot");
  const row = hotspot.rows[0];
  assert(row.is_active === true, "Generated hotspot should be active");
  assert(Number(row.demand_score) >= 0 && Number(row.demand_score) <= 100, "Invalid demand score");
  assert(Number(row.drivers_needed) > 0, "drivers_needed was not persisted");
  assert(Number(row.radius_meters) > 0, "radius_meters was not persisted");
  assert(typeof row.insight_text === "string" && row.insight_text.length > 0, "Missing insight text");

  console.log(
    JSON.stringify(
      {
        passed: true,
        refreshResult: result,
        generatedHotspot: {
          id: row.id,
          demandLevel: row.demand_level,
          demandScore: Number(row.demand_score),
          driversNeeded: Number(row.drivers_needed),
          radiusMeters: Number(row.radius_meters)
        }
      },
      null,
      2
    )
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  await query("DELETE FROM hotspots WHERE event_id = $1", [eventId]).catch(() => {});
  await query("DELETE FROM events WHERE id = $1", [eventId]).catch(() => {});
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
