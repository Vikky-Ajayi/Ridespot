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

function resolveMarketContext(lat: number, lng: number) {
  if (lat > 51 && lat < 52 && lng > -1 && lng < 0.5) {
    return { city: "London", country: "UK", room: "market:london" };
  }

  if (lat > 53 && lat < 54 && lng > -3.5 && lng < -1.5) {
    return { city: "Manchester", country: "UK", room: "market:manchester" };
  }

  if (lat > 52 && lat < 53.5 && lng > -2.5 && lng < -1) {
    return { city: "Birmingham", country: "UK", room: "market:birmingham" };
  }

  if (lat > 6 && lat < 7 && lng > 3 && lng < 4.5) {
    return { city: "Lagos", country: "Nigeria", room: "market:lagos" };
  }

  if (lat > 8 && lat < 10 && lng > 7 && lng < 8.5) {
    return { city: "Abuja", country: "Nigeria", room: "market:abuja" };
  }

  return { city: null, country: null, room: "market:global" };
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
  const market = resolveMarketContext(data.lat, data.lng);

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
