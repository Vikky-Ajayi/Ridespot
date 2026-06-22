import dotenv from "dotenv";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const timeout = setTimeout(() => {
  console.error("smoke:auth-flow timed out");
  process.exit(1);
}, 120000);

const { buildApp } = await import(pathToFileURL(resolve(backendRoot, "dist/app.js")).href);
const { query, db } = await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href);
const { redis } = await import(pathToFileURL(resolve(backendRoot, "dist/config/redis.js")).href);

const email = `auth-flow-${Date.now()}@ridespot.test`;
const password = "SecurePass123";
const newPassword = "SecurePass456";
let app = null;
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function inject(name, request, assertResponse = (response) => response.statusCode < 400) {
  const response = await app.inject(request);
  const body = response.json();
  if (!assertResponse(response, body)) {
    throw new Error(`${name} failed with ${response.statusCode}: ${response.body}`);
  }
  return { response, body };
}

async function latestOtpCode(type) {
  const result = await query(
    `SELECT code
     FROM otp_codes
     WHERE email = $1 AND type = $2 AND used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, type]
  );
  assert(result.rowCount === 1, `Missing ${type} OTP in database`);
  return result.rows[0].code;
}

try {
  app = await buildApp();
  await app.ready();

  await query("DELETE FROM drivers WHERE email LIKE $1", ["auth-flow-%@ridespot.test"]);

  const register = await inject("register", {
    method: "POST",
    url: "/api/auth/register",
    remoteAddress: "10.44.0.10",
    payload: {
      fullName: "Auth Flow Driver",
      email,
      phone: "+447700900111",
      country: "United Kingdom",
      password
    }
  }, (response) => response.statusCode === 201);

  const verificationCode = register.body.data?.devOtp ?? await latestOtpCode("email_verification");

  const verifyEmail = await inject("verify email", {
    method: "POST",
    url: "/api/auth/verify-email",
    remoteAddress: "10.44.0.11",
    payload: {
      email,
      code: verificationCode
    }
  }, (response, body) => response.statusCode === 200 && Boolean(body.data?.token));

  const login = await inject("login", {
    method: "POST",
    url: "/api/auth/login",
    remoteAddress: "10.44.0.12",
    payload: { email, password }
  }, (response, body) => response.statusCode === 200 && Boolean(body.data?.token));

  await inject("me", {
    method: "GET",
    url: "/api/auth/me",
    remoteAddress: "10.44.0.13",
    headers: {
      authorization: `Bearer ${login.body.data.token}`
    }
  }, (response, body) => response.statusCode === 200 && body.data.email === email && body.data.country === "UK");

  const forgot = await inject("forgot password", {
    method: "POST",
    url: "/api/auth/forgot-password",
    remoteAddress: "10.44.0.14",
    payload: { email }
  }, (response) => response.statusCode === 200);

  const resetCode = forgot.body.data?.devOtp ?? await latestOtpCode("password_reset");

  await inject("reset password", {
    method: "POST",
    url: "/api/auth/reset-password",
    remoteAddress: "10.44.0.15",
    payload: {
      email,
      code: resetCode,
      newPassword
    }
  }, (response) => response.statusCode === 200);

  await inject("login with new password", {
    method: "POST",
    url: "/api/auth/login",
    remoteAddress: "10.44.0.16",
    payload: { email, password: newPassword }
  }, (response, body) => response.statusCode === 200 && Boolean(body.data?.token));

  const driver = await query(
    `SELECT d.id, d.country, d.is_email_verified, np.driver_id IS NOT NULL AS has_preferences
     FROM drivers d
     LEFT JOIN notification_preferences np ON np.driver_id = d.id
     WHERE d.email = $1`,
    [email]
  );

  assert(driver.rowCount === 1, "Registered driver was not persisted");
  assert(driver.rows[0].country === "UK", "Driver country was not canonicalized to UK");
  assert(driver.rows[0].is_email_verified === true, "Driver was not verified");
  assert(driver.rows[0].has_preferences === true, "Default notification preferences were not created");

  console.log(
    JSON.stringify(
      {
        passed: true,
        checks: {
          registerStatus: register.response.statusCode,
          verifyStatus: verifyEmail.response.statusCode,
          loginStatus: login.response.statusCode,
          resetStatus: 200,
          country: driver.rows[0].country,
          hasPreferences: driver.rows[0].has_preferences
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
  await query("DELETE FROM drivers WHERE email = $1", [email]).catch(() => {});
  if (app) {
    await app.close().catch(() => {});
  }
  await redis.quit().catch(() => {});
  await db.end().catch(() => {});
  clearTimeout(timeout);
}

process.exit(exitCode);
