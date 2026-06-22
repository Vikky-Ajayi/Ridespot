import dotenv from "dotenv";
import { io } from "socket.io-client";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:socket timed out");
  process.exit(1);
}, 45000);

const imports = {
  app: await import(pathToFileURL(resolve(backendRoot, "dist/app.js")).href),
  database: await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href),
  redis: await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href),
  jwt: await import(pathToFileURL(resolve(backendRoot, "dist/utils/jwt.js")).href),
  socket: await import(pathToFileURL(resolve(backendRoot, "dist/websocket/socket.server.js")).href)
};

const { buildApp } = imports.app;
const { db, query, verifyDatabaseConnection } = imports.database;
const { redis } = imports.redis;
const { signAuthToken } = imports.jwt;
const { closeSocketServer, initSocketServer } = imports.socket;

const email = `socket-smoke-${Date.now()}@ridespot.test`;
let app = null;
let activeSocket = null;
let driverId = null;
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
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

  await query("DELETE FROM drivers WHERE email LIKE $1", ["socket-smoke-%@ridespot.test"]);

  const inserted = await query(
    `INSERT INTO drivers (full_name, email, country, password_hash, is_email_verified)
     VALUES ($1, $2, $3, $4, TRUE)
     RETURNING id`,
    ["Socket Smoke", email, "UK", "smoke-not-a-real-hash"]
  );
  driverId = inserted.rows[0].id;

  await query(
    `INSERT INTO notification_preferences (driver_id, demand_notifications, night_mode_alerts)
     VALUES ($1, TRUE, TRUE)
     ON CONFLICT (driver_id) DO NOTHING`,
    [driverId]
  );

  const token = signAuthToken({
    sub: driverId,
    email,
    planTier: "free",
    country: "UK"
  });

  activeSocket = await connectSocket(baseUrl, token);
  activeSocket.emit("driver:location", { lat: 51.556, lng: -0.2796 });
  const ack = await waitForSocketEvent(activeSocket, "location:ack", 8000);

  const location = await query(
    `SELECT is_online, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
     FROM driver_locations
     WHERE driver_id = $1`,
    [driverId]
  );

  assert(ack?.received === true, `Expected received ack, got ${JSON.stringify(ack)}`);
  assert(
    location.rowCount === 1 && location.rows[0].is_online === true,
    "driver_locations row was not created or is not online"
  );

  console.log(
    JSON.stringify(
      {
        passed: true,
        baseUrl,
        connected: true,
        ack,
        location: location.rows[0]
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
  await closeSocketServer().catch(() => {});
  if (app) {
    await app.close().catch(() => {});
  }
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
