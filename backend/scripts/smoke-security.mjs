import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:security timed out");
  process.exit(1);
}, 120000);

const { buildApp } = await import(pathToFileURL(resolve(backendRoot, "dist/app.js")).href);
const { db } = await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href);
const { redis } = await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href);
const { env } = await import(pathToFileURL(resolve(backendRoot, "dist/config/env.js")).href);

let app = null;
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function randomPrivateAddress(prefix) {
  return `${prefix}.${Math.floor(Math.random() * 200) + 1}.${Math.floor(Math.random() * 200) + 1}`;
}

async function check(name, request, assertResponse) {
  const response = await app.inject(request);
  const contentType = response.headers["content-type"];
  const body =
    typeof contentType === "string" && contentType.includes("application/json")
      ? response.json()
      : response.body;

  if (!assertResponse(response, body)) {
    throw new Error(`${name} failed with ${response.statusCode}: ${response.body}`);
  }

  return { name, statusCode: response.statusCode, body, headers: response.headers };
}

try {
  app = await buildApp();
  await app.ready();

  const checks = [];

  checks.push(
    await check(
      "allowed CORS preflight",
      {
        method: "OPTIONS",
        url: "/api/auth/login",
        headers: {
          origin: env.FRONTEND_URL,
          "access-control-request-method": "POST"
        }
      },
      (response) =>
        response.statusCode === 204 &&
        response.headers["access-control-allow-origin"] === env.FRONTEND_URL &&
        response.headers["access-control-allow-credentials"] === "true"
    )
  );

  checks.push(
    await check(
      "disallowed CORS origin has no allow-origin header",
      {
        method: "GET",
        url: "/health",
        headers: {
          origin: "https://evil.example"
        }
      },
      (response) =>
        response.statusCode === 200 &&
        response.headers["access-control-allow-origin"] !== "https://evil.example"
    )
  );

  checks.push(
    await check(
      "protected route without token",
      {
        method: "GET",
        url: "/api/auth/me"
      },
      (response, body) =>
        response.statusCode === 401 &&
        body.success === false &&
        body.error?.code === "UNAUTHORIZED"
    )
  );

  checks.push(
    await check(
      "protected route with invalid token",
      {
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: "Bearer invalid-token"
        }
      },
      (response, body) =>
        response.statusCode === 401 &&
        body.success === false &&
        body.error?.code === "UNAUTHORIZED"
    )
  );

  const expiredToken = jwt.sign(
    {
      sub: "00000000-0000-4000-8000-000000000000",
      email: "expired@ridespot.test",
      planTier: "free"
    },
    env.JWT_SECRET,
    { expiresIn: "-1s" }
  );

  checks.push(
    await check(
      "protected route with expired token",
      {
        method: "GET",
        url: "/api/auth/me",
        headers: {
          authorization: `Bearer ${expiredToken}`
        }
      },
      (response, body) =>
        response.statusCode === 403 &&
        body.success === false &&
        body.error?.code === "FORBIDDEN"
    )
  );

  checks.push(
    await check(
      "validation envelope",
      {
        method: "POST",
        url: "/api/auth/register",
        remoteAddress: randomPrivateAddress("10.55"),
        payload: {
          email: "not-an-email"
        }
      },
      (response, body) =>
        response.statusCode === 400 &&
        body.success === false &&
        body.error?.code === "VALIDATION_ERROR"
    )
  );

  const rateLimitAddress = randomPrivateAddress("10.56");
  let rateLimitedResponse = null;
  for (let index = 0; index < 11; index += 1) {
    rateLimitedResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: rateLimitAddress,
      payload: {
        email: `missing-${Date.now()}-${index}@ridespot.test`,
        password: "WrongPass123"
      }
    });
  }

  const rateLimitBody = rateLimitedResponse.json();
  assert(
    rateLimitedResponse.statusCode === 429,
    `Expected login rate limit status 429, got ${rateLimitedResponse.statusCode}: ${rateLimitedResponse.body}`
  );
  assert(rateLimitBody.success === false, "Expected rate limit error envelope");
  assert(rateLimitBody.error?.code === "RATE_LIMITED", "Expected RATE_LIMITED error code");
  checks.push({
    name: "login rate limit",
    statusCode: rateLimitedResponse.statusCode,
    body: rateLimitBody
  });

  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: checks.map((item) => ({
          name: item.name,
          statusCode: item.statusCode
        }))
      },
      null,
      2
    )
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  if (app) {
    await app.close().catch(() => {});
  }
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
