import dotenv from "dotenv";
import { io as clientIo } from "socket.io-client";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:hotspot-broadcast timed out");
  process.exit(1);
}, 45000);

const imports = {
  app: await import(pathToFileURL(resolve(backendRoot, "dist/app.js")).href),
  database: await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href),
  redis: await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href),
  jwt: await import(pathToFileURL(resolve(backendRoot, "dist/utils/jwt.js")).href),
  socket: await import(pathToFileURL(resolve(backendRoot, "dist/websocket/socket.server.js")).href),
  hotspot: await import(pathToFileURL(resolve(backendRoot, "dist/websocket/hotspot.handler.js")).href)
};

const { buildApp } = imports.app;
const { db, query } = imports.database;
const { redis } = imports.redis;
const { signAuthToken } = imports.jwt;
const { closeSocketServer, getSocketServer, initSocketServer } = imports.socket;
const { broadcastHotspotUpdate } = imports.hotspot;

const email = `broadcast-smoke-${Date.now()}@ridespot.test`;
let app = null;
let activeSocket = null;
let driverId = null;
let exitCode = 0;

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
    const socket = clientIo(baseUrl, {
      auth: { token },
      reconnection: false,
      timeout: 5000,
      transports: ["websocket", "polling"]
    });

    socket.once("connect", () => resolvePromise(socket));
    socket.once("connect_error", rejectPromise);
  });
}

try {
  const inserted = await query(
    `INSERT INTO drivers (full_name, email, country, password_hash, is_email_verified)
     VALUES ('Broadcast Smoke', $1, 'UK', 'not-used', TRUE)
     RETURNING id`,
    [email]
  );
  driverId = inserted.rows[0].id;

  app = await buildApp();
  initSocketServer(app.server);
  await app.listen({ host: "127.0.0.1", port: 0 });

  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!port) {
    throw new Error("Could not resolve ephemeral server port");
  }

  const token = signAuthToken({
    sub: driverId,
    email,
    planTier: "free",
    country: "UK"
  });

  activeSocket = await connectSocket(`http://127.0.0.1:${port}`, token);
  const receivedPromise = waitForSocketEvent(activeSocket, "hotspots:updated", 8000);

  broadcastHotspotUpdate(
    getSocketServer(),
    { country: "UK", city: "London" },
    [{ id: "smoke-hotspot", name: "Smoke Hotspot", routingDecision: "go" }]
  );

  const payload = await receivedPromise;
  console.log(
    JSON.stringify(
      {
        passed: true,
        receivedCount: payload.hotspots.length,
        firstName: payload.hotspots[0]?.name,
        generatedAtPresent: Boolean(payload.generatedAt)
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
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
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
