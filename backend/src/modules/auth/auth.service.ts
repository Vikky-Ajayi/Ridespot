import bcrypt from "bcrypt";
import { Resend } from "resend";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../../config/database.js";
import { env } from "../../config/env.js";
import { assertMarketCountry, canonicalMarketCountry } from "../../utils/country.js";
import { AppError } from "../../utils/http.js";
import type { PlanTier } from "../../utils/jwt.js";

const resend = new Resend(env.RESEND_API_KEY);
const PASSWORD_ROUNDS = 12;

interface DriverRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  avatar_url: string | null;
  plan_tier: PlanTier;
  is_email_verified: boolean;
  password_hash: string;
}

interface NotificationPreferenceRow {
  mail_notifications: boolean;
  demand_notifications: boolean;
  night_mode_alerts: boolean;
}

function mapDriverSummary(driver: Pick<DriverRow, "id" | "full_name" | "email" | "plan_tier" | "country">) {
  return {
    id: driver.id,
    fullName: driver.full_name,
    email: driver.email,
    planTier: driver.plan_tier,
    country: canonicalMarketCountry(driver.country)
  };
}

function mapDriverProfile(driver: DriverRow, notificationPreferences: NotificationPreferenceRow) {
  return {
    id: driver.id,
    fullName: driver.full_name,
    email: driver.email,
    phone: driver.phone,
    country: canonicalMarketCountry(driver.country),
    avatarUrl: driver.avatar_url,
    planTier: driver.plan_tier,
    isEmailVerified: driver.is_email_verified,
    notificationPreferences: {
      mailNotifications: notificationPreferences.mail_notifications,
      demandNotifications: notificationPreferences.demand_notifications,
      nightModeAlerts: notificationPreferences.night_mode_alerts
    }
  };
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function shouldUseDevelopmentOtpFallback() {
  return env.NODE_ENV !== "production" && env.RESEND_API_KEY.startsWith("dev-");
}

async function sendOtpEmail(email: string, code: string, type: "email_verification" | "password_reset") {
  if (shouldUseDevelopmentOtpFallback()) {
    return {
      delivered: false,
      devOtp: code
    };
  }

  const subject =
    type === "email_verification" ? "Verify your RideSpot email" : "Reset your RideSpot password";
  const intro =
    type === "email_verification"
      ? "Use the code below to verify your RideSpot account."
      : "Use the code below to reset your RideSpot password.";

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: [email],
    subject,
    html: `<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827">
      <p>${intro}</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:0.12em">${code}</p>
      <p>This code expires in 10 minutes.</p>
    </div>`
  });

  return {
    delivered: true
  };
}

async function getDriverByEmail(email: string, client?: PoolClient) {
  const sql = `SELECT id, full_name, email, phone, country, avatar_url, plan_tier, is_email_verified, password_hash
     FROM drivers
     WHERE email = $1`;
  const values = [email.toLowerCase()];
  const result = client
    ? await client.query<DriverRow>(sql, values)
    : await query<DriverRow>(sql, values);

  return result.rows[0] ?? null;
}

async function insertOtpCode(
  client: PoolClient,
  options: { driverId: string | null; email: string; code: string; type: "email_verification" | "password_reset" }
) {
  await client.query(
    `INSERT INTO otp_codes (driver_id, email, code, type, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes')`,
    [options.driverId, options.email.toLowerCase(), options.code, options.type]
  );
}

export const authService = {
  async register(input: {
    fullName: string;
    email: string;
    phone?: string | null;
    country: string;
    password: string;
  }) {
    const existing = await getDriverByEmail(input.email);
    if (existing) {
      throw new AppError(409, "EMAIL_EXISTS", "Email is already registered");
    }

    const passwordHash = await bcrypt.hash(input.password, PASSWORD_ROUNDS);
    const email = input.email.toLowerCase();
    const code = generateOtpCode();

    await withTransaction(async (client) => {
      const insertDriver = await client.query<{ id: string }>(
        `INSERT INTO drivers (full_name, email, phone, country, password_hash)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          input.fullName,
          email,
          input.phone ?? null,
          assertMarketCountry(input.country),
          passwordHash
        ]
      );

      const driverId = insertDriver.rows[0]?.id;
      if (!driverId) {
        throw new AppError(500, "INTERNAL_SERVER_ERROR", "Could not create driver");
      }

      await client.query(
        `INSERT INTO notification_preferences (driver_id)
         VALUES ($1)`,
        [driverId]
      );

      await insertOtpCode(client, {
        driverId,
        email,
        code,
        type: "email_verification"
      });
    });

    const emailResult = await sendOtpEmail(email, code, "email_verification");
    return emailResult.devOtp ? { devOtp: emailResult.devOtp } : {};
  },

  async verifyEmail(input: { email: string; code: string }) {
    const email = input.email.toLowerCase();

    return withTransaction(async (client) => {
      const otpResult = await client.query<{ id: string; driver_id: string }>(
        `SELECT id, driver_id
         FROM otp_codes
         WHERE email = $1
           AND code = $2
           AND type = 'email_verification'
           AND used = FALSE
         ORDER BY created_at DESC
         LIMIT 1`,
        [email, input.code]
      );

      const otp = otpResult.rows[0];
      if (!otp) {
        throw new AppError(400, "OTP_INVALID", "OTP code is invalid");
      }

      const expiryResult = await client.query<{ expires_at: string }>(
        `SELECT expires_at
         FROM otp_codes
         WHERE id = $1`,
        [otp.id]
      );

      if (new Date(expiryResult.rows[0]?.expires_at ?? 0).getTime() < Date.now()) {
        throw new AppError(400, "OTP_EXPIRED", "OTP code has expired");
      }

      await client.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id]);
      await client.query(
        `UPDATE drivers
         SET is_email_verified = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [otp.driver_id]
      );

      const driver = await getDriverByEmail(email, client);
      if (!driver) {
        throw new AppError(404, "NOT_FOUND", "Driver not found");
      }

      return mapDriverSummary(driver);
    });
  },

  async login(input: { email: string; password: string }) {
    const driver = await getDriverByEmail(input.email);
    if (!driver) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    const passwordMatches = await bcrypt.compare(input.password, driver.password_hash);
    if (!passwordMatches) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect");
    }

    if (!driver.is_email_verified) {
      throw new AppError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Please verify your email before logging in"
      );
    }

    return mapDriverSummary(driver);
  },

  async resendOtp(input: { email: string; type: "email_verification" | "password_reset" }) {
    const driver = await getDriverByEmail(input.email);

    if (!driver) {
      if (input.type === "password_reset") {
        return {};
      }

      throw new AppError(404, "NOT_FOUND", "Driver not found");
    }

    const code = generateOtpCode();

    await withTransaction(async (client) => {
      await insertOtpCode(client, {
        driverId: driver.id,
        email: driver.email,
        code,
        type: input.type
      });
    });

    const emailResult = await sendOtpEmail(driver.email, code, input.type);
    return emailResult.devOtp ? { devOtp: emailResult.devOtp } : {};
  },

  async forgotPassword(input: { email: string }) {
    const driver = await getDriverByEmail(input.email);
    if (!driver) {
      return {};
    }

    const code = generateOtpCode();

    await withTransaction(async (client) => {
      await insertOtpCode(client, {
        driverId: driver.id,
        email: driver.email,
        code,
        type: "password_reset"
      });
    });

    const emailResult = await sendOtpEmail(driver.email, code, "password_reset");
    return emailResult.devOtp ? { devOtp: emailResult.devOtp } : {};
  },

  async resetPassword(input: { email: string; code: string; newPassword: string }) {
    const email = input.email.toLowerCase();
    const passwordHash = await bcrypt.hash(input.newPassword, PASSWORD_ROUNDS);

    await withTransaction(async (client) => {
      const otpResult = await client.query<{ id: string; driver_id: string; expires_at: string }>(
        `SELECT id, driver_id, expires_at
         FROM otp_codes
         WHERE email = $1
           AND code = $2
           AND type = 'password_reset'
           AND used = FALSE
         ORDER BY created_at DESC
         LIMIT 1`,
        [email, input.code]
      );

      const otp = otpResult.rows[0];
      if (!otp) {
        throw new AppError(400, "OTP_INVALID", "OTP code is invalid");
      }

      if (new Date(otp.expires_at).getTime() < Date.now()) {
        throw new AppError(400, "OTP_EXPIRED", "OTP code has expired");
      }

      await client.query(
        `UPDATE drivers
         SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, otp.driver_id]
      );

      await client.query(`UPDATE otp_codes SET used = TRUE WHERE id = $1`, [otp.id]);
    });
  },

  async getMe(driverId: string) {
    const driverResult = await query<DriverRow>(
      `SELECT id, full_name, email, phone, country, avatar_url, plan_tier, is_email_verified, password_hash
       FROM drivers
       WHERE id = $1`,
      [driverId]
    );

    const driver = driverResult.rows[0];
    if (!driver) {
      throw new AppError(404, "NOT_FOUND", "Driver not found");
    }

    const notificationsResult = await query<NotificationPreferenceRow>(
      `SELECT mail_notifications, demand_notifications, night_mode_alerts
       FROM notification_preferences
       WHERE driver_id = $1`,
      [driverId]
    );

    return mapDriverProfile(driver, notificationsResult.rows[0] ?? {
      mail_notifications: true,
      demand_notifications: false,
      night_mode_alerts: false
    });
  }
};
