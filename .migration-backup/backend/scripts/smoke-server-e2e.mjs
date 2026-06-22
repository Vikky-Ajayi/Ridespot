import bcrypt from "bcrypt";
import dotenv from "dotenv";
import { io } from "socket.io-client";
import { randomUUID } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke-server-e2e timed out");
  process.exit(1);
}, 45000);

const imports = {
  app: await import(pathToFileURL(resolve(backendRoot, "dist/app.js")).href),
  database: await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href),
  redis: await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href),
  socket: await import(pathToFileURL(resolve(backendRoot, "dist/websocket/socket.server.js")).href)
};

const { buildApp } = imports.app;
const { db, query, verifyDatabaseConnection } = imports.database;
const { redis } = imports.redis;
const { closeSocketServer, initSocketServer } = imports.socket;

const email = `server-e2e-${Date.now()}@ridespot.test`;
const password = "SecurePass123";
let driverId = null;
let joinedEventId = null;
let joinedHotspotId = null;
let app = null;
let activeSocket = null;
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(baseUrl, method, path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function waitForSocketEvent(socket, eventName, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolvePromise(payload);
    });
  });
}

function connectSocket(baseUrl, token) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = io(baseUrl, {
      auth: { token },
      reconnection: false,
      timeout: 5000,
      transports: ["websocket", "polling"]
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      rejectPromise(new Error("Timed out waiting for socket connect"));
    }, 6000);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolvePromise(socket);
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      socket.disconnect();
      rejectPromise(error);
    });
  });
}

try {
  await verifyDatabaseConnection();

  app = await buildApp();
  initSocketServer(app.server);
  await app.listen({ host: "127.0.0.1", port: 0 });

  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : null;
  assert(port, "Could not resolve ephemeral server port");
  const baseUrl = `http://127.0.0.1:${port}`;

  await query("DELETE FROM drivers WHERE email LIKE $1", ["server-e2e-%@ridespot.test"]);

  const passwordHash = await bcrypt.hash(password, 12);
  const inserted = await query(
    `INSERT INTO drivers (full_name, email, phone, country, password_hash, is_email_verified)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id`,
    ["Server E2E", email, "+447700900123", "UK", passwordHash]
  );
  driverId = inserted.rows[0].id;
  await query(
    `INSERT INTO notification_preferences (driver_id)
     VALUES ($1)
     ON CONFLICT (driver_id) DO NOTHING`,
    [driverId]
  );

  const wrongLogin = await request(baseUrl, "POST", "/api/auth/login", {
    body: { email, password: "WrongPass123" }
  });
  assert(wrongLogin.response.status === 401, "Wrong password should return 401");
  assert(
    wrongLogin.body?.error?.code === "INVALID_CREDENTIALS",
    `Wrong password should return INVALID_CREDENTIALS, got ${JSON.stringify(wrongLogin.body)}`
  );

  const login = await request(baseUrl, "POST", "/api/auth/login", {
    body: { email, password }
  });
  assert(login.response.status === 200, `Login failed: ${JSON.stringify(login.body)}`);
  const token = login.body.data.token;
  assert(token, "Login did not return token");

  const me = await request(baseUrl, "GET", "/api/auth/me", { token });
  assert(me.response.status === 200, "GET /api/auth/me failed");
  assert(me.body.data.email === email, "GET /api/auth/me returned wrong profile");

  const profileUpdate = await request(baseUrl, "PUT", "/api/driver/profile", {
    token,
    body: { fullName: "Server E2E Updated", phone: "+447700900456", country: "UK" }
  });
  assert(profileUpdate.response.status === 200, "PUT /api/driver/profile failed");

  const prefsUpdate = await request(baseUrl, "PUT", "/api/driver/notifications/preferences", {
    token,
    body: {
      mailNotifications: true,
      demandNotifications: true,
      nightModeAlerts: true
    }
  });
  assert(prefsUpdate.response.status === 200, "PUT notification preferences failed");

  joinedEventId = randomUUID();
  joinedHotspotId = randomUUID();
  await query(
    `INSERT INTO events (
       id, external_id, source, name, venue_name, location, address, city, country,
       start_time, end_time, expected_attendance, event_type, event_category, is_active
     ) VALUES (
       $1, $2, 'manual', 'Server E2E Event', 'Server E2E Venue',
       ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
       'Wembley', 'London', 'UK', NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours',
       2500, 'Concert', 'Entertainment', TRUE
     )`,
    [joinedEventId, `server-e2e-${Date.now()}`, -0.2794, 51.5561]
  );
  await query(
    `INSERT INTO hotspots (
       id, name, postcode, location, radius_meters, demand_level, demand_score, live_score,
       drive_time_text, distance_text, driver_saturation, insight_text, drivers_needed,
       active_time_start, active_time_end, event_id, is_active, generated_at, expires_at
     ) VALUES (
       $1, 'Server E2E Venue', 'E2E 1AB',
       ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
       300, 'very-high', 99.00, 99, '4 min', '0.4 KM', 'LOW',
       'Event-backed API join smoke hotspot.', 2,
       NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', $4, TRUE,
       NOW() - INTERVAL '40 minutes', NOW() + INTERVAL '2 hours'
     )`,
    [joinedHotspotId, -0.2794, 51.5561, joinedEventId]
  );

  const hotspots = await request(
    baseUrl,
    "GET",
    "/api/hotspots?lat=51.5560&lng=-0.2796&radius=15000&limit=10",
    { token }
  );
  assert(hotspots.response.status === 200, `GET /api/hotspots failed: ${hotspots.response.status}`);
  assert(
    Array.isArray(hotspots.body.data.hotspots) && hotspots.body.data.hotspots.length >= 1,
    "Expected at least one event-backed hotspot"
  );
  const joinedHotspot = hotspots.body.data.hotspots.find(
    (hotspot) => hotspot.id === joinedHotspotId
  );
  assert(joinedHotspot, "Expected event-backed smoke hotspot in API response");
  assert(
    joinedHotspot.city === "London" && joinedHotspot.country === "UK",
    `Expected hotspot city/country from event join, got ${JSON.stringify(joinedHotspot)}`
  );

  const firstHotspot = hotspots.body.data.hotspots[0];
  const demandByHour = await request(
    baseUrl,
    "GET",
    `/api/hotspots/${firstHotspot.id}/demand-by-hour`,
    { token }
  );
  assert(demandByHour.response.status === 200, "GET demand-by-hour failed");

  activeSocket = await connectSocket(baseUrl, token);
  activeSocket.emit("driver:location", { lat: 51.556, lng: -0.2796 });
  const ack = await waitForSocketEvent(activeSocket, "location:ack", 8000);
  assert(ack?.received === true, `Expected received location ack, got ${JSON.stringify(ack)}`);

  const location = await query(
    `SELECT is_online, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM driver_locations
     WHERE driver_id = $1`,
    [driverId]
  );
  assert(location.rowCount === 1, "driver_locations row was not written");
  assert(location.rows[0].is_online === true, "driver location should be online");

  console.log(
    JSON.stringify(
      {
        passed: true,
        baseUrl,
        checks: {
          wrongLoginStatus: wrongLogin.response.status,
          loginStatus: login.response.status,
          meEmail: me.body.data.email,
          hotspotCount: hotspots.body.data.hotspots.length,
          demandByHourStatus: demandByHour.response.status,
          socketAck: ack,
          location: location.rows[0]
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
  if (activeSocket) {
    activeSocket.disconnect();
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  if (driverId) {
    await query("DELETE FROM drivers WHERE id = $1", [driverId]).catch(() => {});
  }
  if (joinedHotspotId) {
    await query("DELETE FROM hotspots WHERE id = $1", [joinedHotspotId]).catch(() => {});
  }
  if (joinedEventId) {
    await query("DELETE FROM events WHERE id = $1", [joinedEventId]).catch(() => {});
  }
  await closeSocketServer().catch(() => {});
  if (app) {
    await app.close().catch(() => {});
  }
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
