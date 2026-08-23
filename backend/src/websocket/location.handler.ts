import type { Socket } from "socket.io";
import { query } from "../config/database.js";
import { redis } from "../config/redis.js";
import { notificationsService } from "../modules/notifications/notifications.service.js";
import { geographyPointSql, getHotspotsWithCoverage } from "../utils/geospatial.js";
import type { AuthTokenPayload } from "../utils/jwt.js";

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Distance beyond which the "nearest" ingestion tile is too far to be a meaningful market
// match -- prevents a driver in the middle of nowhere from being silently bucketed into a
// market a hundred kilometers away just because it happens to be the closest one on record.
const MARKET_MATCH_RADIUS_METERS = 50000;

// Was a hardcoded 3-UK-city + 2-Nigeria-city bounding-box check. Now resolves against the
// same event_ingestion_tiles grid that ingestion uses (see migration 016 / events.service.ts),
// so a driver anywhere in the ~95-town UK grid (not just London/Manchester/Birmingham) gets
// bucketed into a real market room and actually receives that market's hotspots:updated
// broadcasts instead of silently falling through to market:global.
async function resolveMarketContext(lat: number, lng: number) {
  try {
    const result = await query<{
      label: string;
      country: "Nigeria" | "UK";
      distance_meters: string | number;
    }>(
      `SELECT label, country,
              ST_Distance(
                ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
                ${geographyPointSql("$2", "$1")}
              ) AS distance_meters
       FROM event_ingestion_tiles
       WHERE is_active = TRUE
       ORDER BY distance_meters ASC
       LIMIT 1`,
      [lat, lng]
    );

    const nearest = result.rows[0];
    if (!nearest || Number(nearest.distance_meters) > MARKET_MATCH_RADIUS_METERS) {
      return { city: null, country: null, room: "market:global" };
    }

    const citySlug = nearest.label.toLowerCase().replace(/\s+/g, "-");
    return { city: nearest.label, country: nearest.country, room: `market:${citySlug}` };
  } catch (error) {
    // event_ingestion_tiles may not exist yet (migration not run) -- degrade to global rather
    // than failing the location update.
    console.warn(
      JSON.stringify({
        event: "resolve_market_context_failed",
        message: error instanceof Error ? error.message : String(error)
      })
    );
    return { city: null, country: null, room: "market:global" };
  }
}

export async function handleLocationUpdate(socket: Socket, data: { lat: number; lng: number }) {
  const driver = socket.data.driver;
  if (!driver || typeof data?.lat !== "number" || typeof data?.lng !== "number") {
    socket.emit("location:ack", {
      received: false,
      timestamp: Date.now(),
      zonesInRange: 0
    });
    return;
  }

  const driverId = driver.sub;
  const market = await resolveMarketContext(data.lat, data.lng);

  await query(
    `INSERT INTO driver_locations (driver_id, location, is_online, last_seen)
     VALUES ($1, ${geographyPointSql("$3", "$2")}, TRUE, NOW())
     ON CONFLICT (driver_id)
     DO UPDATE SET
       location = EXCLUDED.location,
       is_online = TRUE,
       last_seen = NOW()`,
    [driverId, data.lat, data.lng]
  );

  await redis.setex(
    `driver:location:${driverId}`,
    180,
    JSON.stringify({ lat: data.lat, lng: data.lng, updatedAt: Date.now() })
  );

  const hotspots = await getHotspotsWithCoverage();
  const cityHotspots = market.city
    ? hotspots.filter((hotspot) => hotspot.city === market.city)
    : hotspots;

  const driverInZones: string[] = [];

  for (const hotspot of cityHotspots) {
    const distanceMeters = calculateDistance(data.lat, data.lng, hotspot.lat, hotspot.lng);
    const isInZone = distanceMeters <= hotspot.radius_meters;

    if (isInZone) {
      driverInZones.push(hotspot.id);
      await query(
        `INSERT INTO driver_coverage (hotspot_id, driver_id, entered_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (hotspot_id, driver_id) DO NOTHING`,
        [hotspot.id, driverId]
      );
    } else {
      await query(
        `DELETE FROM driver_coverage
         WHERE hotspot_id = $1
           AND driver_id = $2`,
        [hotspot.id, driverId]
      );
    }
  }

  await notificationsService.evaluateAndNotify(
    cityHotspots,
    driverId,
    market.city,
    market.country ?? driver.country ?? null
  );

  const rooms = Array.from(socket.rooms);
  for (const existingRoom of rooms) {
    if (existingRoom.startsWith("market:") && existingRoom !== market.room) {
      socket.leave(existingRoom);
    }
  }
  socket.join(market.room);

  socket.emit("location:ack", {
    received: true,
    timestamp: Date.now(),
    zonesInRange: driverInZones.length
  });
}

function resolveSocketMarket(socket: Socket) {
  const marketRoom = Array.from(socket.rooms).find(
    (room) => room.startsWith("market:") && room !== "market:global"
  );

  if (!marketRoom) {
    return { city: null, country: socket.data.driver?.country ?? null };
  }

  const citySlug = marketRoom.replace("market:", "");
  const city = citySlug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return { city, country: socket.data.driver?.country ?? null };
}

async function cleanupDriverCoverage(driver: AuthTokenPayload, socket?: Socket) {
  const driverId = driver.sub;
  const driverCoverage = await query<{ hotspot_id: string }>(
    `SELECT hotspot_id
     FROM driver_coverage
     WHERE driver_id = $1`,
    [driverId]
  );
  const affectedHotspotIds = new Set(driverCoverage.rows.map((row) => row.hotspot_id));
  const beforeCleanup = await getHotspotsWithCoverage();
  const affectedBeforeCleanup = beforeCleanup.filter((hotspot) =>
    affectedHotspotIds.has(hotspot.id)
  );

  await query(
    `UPDATE driver_locations
     SET is_online = FALSE, last_seen = NOW()
     WHERE driver_id = $1`,
    [driverId]
  );

  await query(
    `DELETE FROM driver_coverage
     WHERE driver_id = $1`,
    [driverId]
  );

  await redis.del(`driver:location:${driverId}`);

  const market = socket ? resolveSocketMarket(socket) : { city: null, country: driver.country ?? null };
  const affectedHotspots = market.city
    ? affectedBeforeCleanup.filter((hotspot) => hotspot.city === market.city)
    : affectedBeforeCleanup;

  if (affectedHotspots.length) {
    await notificationsService.evaluateAndNotify(
      affectedHotspots,
      driverId,
      market.city,
      market.country
    );
  }
}

export async function handleDisconnect(socket: Socket) {
  const driver = socket.data.driver as AuthTokenPayload | undefined;
  if (!driver) {
    return;
  }

  await cleanupDriverCoverage(driver, socket);
}

export async function handleDriverOffline(socket: Socket) {
  const driver = socket.data.driver as AuthTokenPayload | undefined;
  if (!driver) {
    socket.emit("status:updated", { isOnline: false });
    return;
  }

  await cleanupDriverCoverage(driver, socket);
  socket.emit("status:updated", { isOnline: false });
}

export async function handleDriverOnline(socket: Socket) {
  const driver = socket.data.driver as AuthTokenPayload | undefined;
  if (!driver) {
    socket.emit("status:updated", { isOnline: false });
    return;
  }

  await query(
    `UPDATE driver_locations
     SET is_online = TRUE, last_seen = NOW()
     WHERE driver_id = $1`,
    [driver.sub]
  );

  socket.emit("status:updated", { isOnline: true });
}
