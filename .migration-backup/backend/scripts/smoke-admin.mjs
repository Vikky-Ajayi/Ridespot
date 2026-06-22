import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(backendDir, ".env") });
process.env.ML_SERVICE_URL = "http://127.0.0.1:8011";

const mlStub = http.createServer((request, response) => {
  response.setHeader("content-type", "application/json");

  if (request.method === "GET" && request.url === "/health") {
    response.end(JSON.stringify({ status: "ok", model_loaded: true, accuracy: 0.8564 }));
    return;
  }

  if (request.method === "POST" && request.url === "/retrain") {
    response.end(JSON.stringify({ status: "skipped", reason: "smoke test stub" }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "not found" }));
});

await new Promise((resolve) => mlStub.listen(8011, "127.0.0.1", resolve));

const { buildApp } = await import("../dist/app.js");

const app = await buildApp();
await app.ready();

const results = [];

async function check(name, request, assert = (response) => response.statusCode < 400) {
  const response = await app.inject(request);
  const body = response.json();
  const passed = assert(response, body);

  results.push({
    name,
    statusCode: response.statusCode,
    passed,
    body
  });

  if (!passed) {
    throw new Error(`${name} failed with ${response.statusCode}: ${response.body}`);
  }

  return { response, body };
}

const login = await check("admin login", {
  method: "POST",
  url: "/api/admin/auth/login",
  payload: {
    email: "ops@ridespot.app",
    password: "Admin123!"
  }
});

const token = login.body.data.token;
const authHeaders = { authorization: `Bearer ${token}` };

await check("list market configs", {
  method: "GET",
  url: "/api/admin/config/markets",
  headers: authHeaders
}, (_response, body) => Array.isArray(body.data) && body.data.length >= 5);

await check("update Lagos market config", {
  method: "PUT",
  url: "/api/admin/config/markets/Lagos",
  headers: authHeaders,
  payload: {
    notificationRadiusMeters: 300,
    driverPerAttendeeRatio: 10,
    minDriversPerZone: 3,
    alertRadiusMeters: 20000
  }
});

await check("list online drivers", {
  method: "GET",
  url: "/api/admin/drivers/online",
  headers: authHeaders
});

await check("list active hotspots", {
  method: "GET",
  url: "/api/admin/hotspots/active",
  headers: authHeaders
});

await check("list notification logs", {
  method: "GET",
  url: "/api/admin/notifications/logs?limit=10",
  headers: authHeaders
});

await check("ml status", {
  method: "GET",
  url: "/api/admin/ml/status",
  headers: authHeaders
}, (_response, body) => body.data.loaded === true && body.data.accuracy === 0.8564);

await check("ml retrain", {
  method: "POST",
  url: "/api/admin/ml/retrain",
  headers: authHeaders
}, (_response, body) => body.data.status === "skipped");

const eventStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const eventEnd = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

const createdEvent = await check("create manual event", {
  method: "POST",
  url: "/api/admin/events",
  headers: authHeaders,
  payload: {
    name: "Smoke Test Event",
    venueName: "Smoke Test Venue",
    lat: 51.556,
    lng: -0.2796,
    address: "Wembley",
    city: "London",
    country: "UK",
    startTime: eventStart,
    endTime: eventEnd,
    expectedAttendance: 1200,
    eventType: "Concert",
    eventCategory: "Entertainment"
  }
});

const eventId = createdEvent.body.data.id;

await check("list events", {
  method: "GET",
  url: "/api/admin/events?limit=10",
  headers: authHeaders
}, (_response, body) => body.data.some((event) => event.id === eventId));

await check("update manual event", {
  method: "PUT",
  url: `/api/admin/events/${eventId}`,
  headers: authHeaders,
  payload: {
    name: "Smoke Test Event Updated",
    venueName: "Smoke Test Venue",
    lat: 51.556,
    lng: -0.2796,
    address: "Wembley",
    city: "London",
    country: "UK",
    startTime: eventStart,
    endTime: eventEnd,
    expectedAttendance: 1300,
    eventType: "Concert",
    eventCategory: "Entertainment"
  }
});

await check("delete manual event", {
  method: "DELETE",
  url: `/api/admin/events/${eventId}`,
  headers: authHeaders
});

console.log(JSON.stringify({
  passed: true,
  checks: results.map(({ name, statusCode, passed }) => ({ name, statusCode, passed }))
}, null, 2));

await app.close();
await new Promise((resolve) => mlStub.close(resolve));
process.exit(0);
