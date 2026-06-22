import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(scriptDir, "..");
dotenv.config({ path: resolve(backendRoot, ".env") });

const { query, db } = await import(pathToFileURL(resolve(backendRoot, "dist/config/database.js")).href);

const email = `browser-smoke-${Date.now()}@ridespot.test`;
const password = "SecurePass123";

try {
  const inserted = await query(
    `INSERT INTO drivers (full_name, email, phone, country, password_hash, is_email_verified, plan_tier)
     VALUES ($1, $2, $3, $4, $5, TRUE, 'free')
     RETURNING id, email, country, plan_tier`,
    ["Browser Smoke Driver", email, "+447700900321", "UK", await bcrypt.hash(password, 12)]
  );
  const driver = inserted.rows[0];
  await query("INSERT INTO notification_preferences (driver_id) VALUES ($1)", [driver.id]);
  const token = jwt.sign(
    { sub: driver.id, email: driver.email, planTier: driver.plan_tier },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
  console.log(JSON.stringify({ driverId: driver.id, email: driver.email, password, token }, null, 2));
} finally {
  await db.end().catch(() => {});
}
