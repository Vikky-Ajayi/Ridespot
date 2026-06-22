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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildOtpEmailHtml(email: string, code: string, type: "email_verification" | "password_reset") {
  const escapedCode = escapeHtml(code);
  const escapedEmail = escapeHtml(email);
  const isVerification = type === "email_verification";
  const heading = isVerification ? "Verify your RideSpot email" : "Reset your RideSpot password";
  const eyebrow = isVerification ? "Account verification" : "Password reset";
  const intro = isVerification
    ? "Enter this 6-digit code to finish creating your driver account and unlock live demand intelligence."
    : "Enter this 6-digit code to choose a new password for your RideSpot account.";
  const actionPath = isVerification ? "/verify-email" : "/enter-otp";
  const actionUrl = `${env.FRONTEND_URL}${actionPath}?email=${encodeURIComponent(email)}`;
  const actionText = isVerification ? "Open verification page" : "Open reset page";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;background:#f4f6f5;padding:0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#06130f;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your RideSpot code is ${escapedCode}. It expires in 10 minutes.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f5;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:28px;overflow:hidden;border:1px solid #e6ebe8;box-shadow:0 18px 48px rgba(6,19,15,0.08);">
            <tr>
              <td style="background:#06130f;padding:28px 28px 30px;">
                <div style="font-size:32px;line-height:1;font-weight:800;letter-spacing:-1.6px;color:#ffffff;">
                  ride<span style="color:#14d46f;">spot</span>
                </div>
                <div style="margin-top:18px;display:inline-block;border-radius:999px;background:rgba(20,212,111,0.14);padding:8px 12px;color:#14d46f;font-size:12px;line-height:1;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">
                  ${escapeHtml(eyebrow)}
                </div>
                <h1 style="margin:20px 0 0;font-size:34px;line-height:0.98;font-weight:800;letter-spacing:-2.4px;color:#ffffff;">
                  ${escapeHtml(heading)}
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 8px;">
                <p style="margin:0;color:#5f6965;font-size:16px;line-height:1.55;font-weight:500;">
                  ${escapeHtml(intro)}
                </p>
                <div style="margin:26px 0 22px;border-radius:22px;background:#e7fbef;border:1px solid #c6f3d9;padding:24px;text-align:center;">
                  <div style="color:#4f5c57;font-size:12px;line-height:1;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">
                    Your code
                  </div>
                  <div style="margin-top:12px;color:#06130f;font-size:44px;line-height:1;font-weight:800;letter-spacing:9px;">
                    ${escapedCode}
                  </div>
                  <div style="margin-top:12px;color:#66726d;font-size:13px;line-height:1.4;font-weight:600;">
                    Expires in 10 minutes
                  </div>
                </div>
                <a href="${escapeHtml(actionUrl)}" style="display:block;border-radius:18px;background:#06130f;color:#ffffff;text-decoration:none;text-align:center;padding:17px 20px;font-size:16px;line-height:1;font-weight:800;letter-spacing:-0.4px;">
                  ${escapeHtml(actionText)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 30px;">
                <div style="border-top:1px solid #edf0ee;padding-top:18px;">
                  <p style="margin:0;color:#7a8580;font-size:13px;line-height:1.55;font-weight:500;">
                    This code was requested for <strong style="color:#06130f;">${escapedEmail}</strong>. If this was not you, you can ignore this email.
                  </p>
                  <p style="margin:16px 0 0;color:#9aa39f;font-size:12px;line-height:1.5;font-weight:500;">
                    RideSpot helps ride-hailing drivers position smarter with live hotspot intelligence.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

  try {
    await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: [email],
      subject,
      text: `${intro}\n\nCode: ${code}\n\nThis code expires in 10 minutes.`,
      html: buildOtpEmailHtml(email, code, type)
    });
  } catch (error) {
    throw new AppError(
      502,
      "EMAIL_DELIVERY_FAILED",
      "Account was created, but the verification email could not be sent. Check Resend settings, then use resend OTP.",
      error
    );
  }

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
