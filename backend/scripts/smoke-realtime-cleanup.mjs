import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(backendDir, ".env") });

const bcrypt = (await import("bcrypt")).default;
const { query } = await import("../dist/config/database.js");
const { redis } = await import("../dist/config/redis.js");
const { handleDriverOffline, handleDriverOnline } = await import(
  "../dist/websocket/location.handler.js"
);

const suffix = Date.now();
const driverEmail = `socket-cleanup-${suffix}@ridespot.test`;
let driverId;
let hotspotId;
let eventId;
const emitted = [];

const mockSocket = {
  data: {
    driver: null
  },
  rooms: new Set(["socket-cleanup", "market:london"]),
  emit(event, payload) {
    emitted.push({ event, payload });
  }
};

try {
  const passwordHash = await bcrypt.hash("Admin123!", 4);
  const driver = await query(
    `INSERT INTO drivers (full_name, email, password_hash, country, is_email_verified)
     VALUES ($1, $2, $3, 'UK', TRUE)
     RETURNING id`,
    ["Socket Cleanup Driver", driverEmail, passwordHash]
  );
  driverId = driver.rows[0].id;

  mockSocket.data.driver = {
    sub: driverId,
    email: driverEmail,
    planTier: "free",
    country: "UK"
  };

  const event = await query(
    `INSERT INTO events (
       external_id, source, name, venue_name, location, city, country, start_time, end_time,
       expected_attendance, event_type, event_category, raw_data
     ) VALUES (
       $1, 'manual', 'Socket Cleanup Event', 'Wembley',
       ST_SetSRID(ST_MakePoint(-0.2796, 51.5560), 4326)::geography,
       'London', 'UK', NOW(), NOW() + INTERVAL '2 hours', 1000, 'Concert', 'Entertainment', '{}'::jsonb
     )
     RETURNING id`,
    [`socket-cleanup-${suffix}`]
  );
  eventId = event.rows[0].id;

  const hotspot = await query(
    `INSERT INTO hotspots (
       name, postcode, location, radius_meters, demand_level, demand_score, live_score,
       drivers_needed, drive_time_text, distance_text, driver_saturation, event_id, expires_at
     ) VALUES (
       'Wembley', 'N5 1BU',
       ST_SetSRID(ST_MakePoint(-0.2796, 51.5560), 4326)::geography,
       300, 'high', 87.5, 87, 3, '8 min', '5.2 KM', 'LOW', $1, NOW() + INTERVAL '1 hour'
     )
     RETURNING id`,
    [eventId]
  );
  hotspotId = hotspot.rows[0].id;

  await query(
    `INSERT INTO driver_locations (driver_id, location, is_online, last_seen)
     VALUES ($1, ST_SetSRID(ST_MakePoint(-0.2796, 51.5560), 4326)::geography, TRUE, NOW())`,
    [driverId]
  );

  await query(
    `INSERT INTO driver_coverage (hotspot_id, driver_id)
     VALUES ($1, $2)`,
    [hotspotId, driverId]
  );

  await redis.setex(
    `driver:location:${driverId}`,
    180,
    JSON.stringify({ lat: 51.556, lng: -0.2796 })
  );

  await handleDriverOffline(mockSocket);

  const offlineLocation = await query(
    `SELECT is_online FROM driver_locations WHERE driver_id = $1`,
    [driverId]
  );
  const coverageAfterOffline = await query(
    `SELECT COUNT(*)::int AS count FROM driver_coverage WHERE driver_id = $1`,
    [driverId]
  );
  const redisAfterOffline = await redis.get(`driver:location:${driverId}`);

  if (offlineLocation.rows[0]?.is_online !== false) {
    throw new Error("driver_locations.is_online was not set false");
  }

  if (coverageAfterOffline.rows[0]?.count !== 0) {
    throw new Error("driver_coverage rows were not removed");
  }

  if (redisAfterOffline !== null) {
    throw new Error("driver Redis location key was not deleted");
  }

  await handleDriverOnline(mockSocket);

  const onlineLocation = await query(
    `SELECT is_online FROM driver_locations WHERE driver_id = $1`,
    [driverId]
  );

  if (onlineLocation.rows[0]?.is_online !== true) {
    throw new Error("driver_locations.is_online was not set true");
  }

  console.log(JSON.stringify({
    passed: true,
    emitted,
    assertions: {
      offlineLocation: false,
      coverageRowsAfterOffline: 0,
      redisLocationAfterOffline: null,
      onlineLocation: true
    }
  }, null, 2));
} finally {
  if (driverId) {
    await query(`DELETE FROM drivers WHERE id = $1`, [driverId]);
  }
  if (hotspotId) {
    await query(`DELETE FROM hotspots WHERE id = $1`, [hotspotId]);
  }
  if (eventId) {
    await query(`DELETE FROM events WHERE id = $1`, [eventId]);
  }
  await redis.quit();
  process.exit(0);
}
