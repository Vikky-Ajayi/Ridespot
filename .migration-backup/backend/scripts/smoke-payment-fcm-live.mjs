import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:payment-fcm-live timed out");
  process.exit(1);
}, 120000);

const { query, db } = await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href);

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4000";
const email = `stage-payment-fcm-${Date.now()}@ridespot.test`;
let driverId = null;
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(path, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`${path} failed with ${response.status}: ${text}`);
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

try {
  const inserted = await query(
    `INSERT INTO drivers (full_name, email, phone, country, password_hash, is_email_verified, plan_tier)
     VALUES ($1, $2, $3, $4, $5, TRUE, 'free')
     RETURNING id`,
    ["Stage Payment FCM Driver", email, "+447700900888", "UK", "smoke-only"]
  );
  driverId = inserted.rows[0].id;
  await query("INSERT INTO notification_preferences (driver_id) VALUES ($1)", [driverId]);

  const token = jwt.sign(
    { sub: driverId, email, planTier: "free" },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );

  const checkout = await fetchJson(
    "/api/payments/checkout",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ tier: "pro" })
    },
    45000
  );

  const checkoutData = checkout.body.data;
  const checkoutUrl = checkoutData.checkoutUrl;
  const reference = checkoutData.reference ?? checkoutData.subscription?.checkoutReference;
  assert(checkoutData.provider === "sumup", "UK checkout did not route to SumUp");
  assert(Boolean(checkoutUrl), "SumUp checkout URL is missing");
  assert(new URL(checkoutUrl).host.includes("sumup.com"), "Checkout URL is not hosted by SumUp");

  const status = await fetchJson(
    `/api/payments/status?reference=${encodeURIComponent(reference)}`,
    { headers: { authorization: `Bearer ${token}` } },
    20000
  );

  const fcm = await fetchJson(
    "/api/driver/notifications/fcm-token",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: JSON.stringify({ token: "stage-invalid-fcm-token-not-real" })
    },
    15000
  );

  const fcmRow = await query(
    `SELECT np.fcm_token
     FROM notification_preferences np
     JOIN drivers d ON d.id = np.driver_id
     WHERE d.email = $1`,
    [email]
  );

  let fcmDelivery = { result: "not-run" };
  try {
    const { sendToDriver } = await import(pathToFileURL(resolve(backendRoot, "dist/services/fcm.service.js")).href);
    await sendToDriver("stage-invalid-fcm-token-not-real", {
      title: "RideSpot smoke",
      body: "FCM connectivity smoke",
      data: { type: "smoke" }
    });
    fcmDelivery = { result: "unexpectedly-accepted" };
  } catch (error) {
    fcmDelivery = {
      result: "firebase-rejected-invalid-token",
      code: error?.code ?? null,
      message: String(error?.message ?? error).slice(0, 180)
    };
  }

  console.log(
    JSON.stringify(
      {
        passed: true,
        payment: {
          provider: checkoutData.provider,
          hasCheckoutUrl: Boolean(checkoutUrl),
          checkoutHost: new URL(checkoutUrl).host,
          reference,
          subscriptionStatus: status.body.data?.subscription?.status ?? null
        },
        fcmRegistration: {
          success: fcm.body.success === true,
          persisted: fcmRow.rows[0]?.fcm_token === "stage-invalid-fcm-token-not-real"
        },
        fcmDelivery
      },
      null,
      2
    )
  );
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack ?? error.message : error);
} finally {
  if (driverId) {
    await query("DELETE FROM drivers WHERE id = $1", [driverId]).catch(() => {});
  }
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
