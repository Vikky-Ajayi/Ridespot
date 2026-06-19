import bcrypt from "bcrypt";
import type { QueryResultRow } from "pg";
import { query } from "../../config/database.js";
import { assertMarketCountry, canonicalMarketCountry } from "../../utils/country.js";
import { AppError } from "../../utils/http.js";

interface DriverProfileRow extends QueryResultRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  avatar_url: string | null;
  plan_tier: "free" | "pro" | "fleet";
  is_email_verified: boolean;
  password_hash?: string;
  mail_notifications: boolean;
  demand_notifications: boolean;
  night_mode_alerts: boolean;
}

function mapProfile(row: DriverProfileRow) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    country: canonicalMarketCountry(row.country),
    avatarUrl: row.avatar_url,
    planTier: row.plan_tier,
    isEmailVerified: row.is_email_verified,
    notificationPreferences: {
      mailNotifications: row.mail_notifications,
      demandNotifications: row.demand_notifications,
      nightModeAlerts: row.night_mode_alerts
    }
  };
}

export const driverService = {
  async getProfile(driverId: string) {
    const result = await query<DriverProfileRow>(
      `SELECT d.id, d.full_name, d.email, d.phone, d.country, d.avatar_url, d.plan_tier,
              d.is_email_verified, np.mail_notifications, np.demand_notifications, np.night_mode_alerts
       FROM drivers d
       JOIN notification_preferences np ON np.driver_id = d.id
       WHERE d.id = $1`,
      [driverId]
    );

    const driver = result.rows[0];
    if (!driver) {
      throw new AppError(404, "NOT_FOUND", "Driver not found");
    }

    return mapProfile(driver);
  },

  async updateProfile(
    driverId: string,
    payload: { fullName?: string; phone?: string | null; country?: string }
  ) {
    const result = await query<DriverProfileRow>(
      `UPDATE drivers
       SET full_name = COALESCE($2, full_name),
           phone = COALESCE($3, phone),
           country = COALESCE($4, country),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, full_name, email, phone, country, avatar_url, plan_tier, is_email_verified`,
      [
        driverId,
        payload.fullName ?? null,
        payload.phone ?? null,
        payload.country ? assertMarketCountry(payload.country) : null
      ]
    );

    const driver = result.rows[0];
    if (!driver) {
      throw new AppError(404, "NOT_FOUND", "Driver not found");
    }

    const notifications = await query<Pick<DriverProfileRow, "mail_notifications" | "demand_notifications" | "night_mode_alerts">>(
      `SELECT mail_notifications, demand_notifications, night_mode_alerts
       FROM notification_preferences
       WHERE driver_id = $1`,
      [driverId]
    );

    return mapProfile({
      ...driver,
      ...notifications.rows[0]
    } as DriverProfileRow);
  },

  async changePassword(
    driverId: string,
    payload: { currentPassword: string; newPassword: string; confirmNewPassword: string }
  ) {
    const result = await query<{ password_hash: string }>(
      `SELECT password_hash FROM drivers WHERE id = $1`,
      [driverId]
    );

    const driver = result.rows[0];
    if (!driver) {
      throw new AppError(404, "NOT_FOUND", "Driver not found");
    }

    const matches = await bcrypt.compare(payload.currentPassword, driver.password_hash);
    if (!matches) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(payload.newPassword, 12);

    await query(
      `UPDATE drivers
       SET password_hash = $2, updated_at = NOW()
       WHERE id = $1`,
      [driverId, passwordHash]
    );
  },

  async getNotificationPreferences(driverId: string) {
    const result = await query<Pick<DriverProfileRow, "mail_notifications" | "demand_notifications" | "night_mode_alerts">>(
      `SELECT mail_notifications, demand_notifications, night_mode_alerts
       FROM notification_preferences
       WHERE driver_id = $1`,
      [driverId]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Notification preferences not found");
    }

    return {
      mailNotifications: row.mail_notifications,
      demandNotifications: row.demand_notifications,
      nightModeAlerts: row.night_mode_alerts
    };
  },

  async updateNotificationPreferences(
    driverId: string,
    payload: { mailNotifications: boolean; demandNotifications: boolean; nightModeAlerts: boolean }
  ) {
    const result = await query<Pick<DriverProfileRow, "mail_notifications" | "demand_notifications" | "night_mode_alerts">>(
      `UPDATE notification_preferences
       SET mail_notifications = $2,
           demand_notifications = $3,
           night_mode_alerts = $4,
           updated_at = NOW()
       WHERE driver_id = $1
       RETURNING mail_notifications, demand_notifications, night_mode_alerts`,
      [driverId, payload.mailNotifications, payload.demandNotifications, payload.nightModeAlerts]
    );

    const row = result.rows[0];
    if (!row) {
      throw new AppError(404, "NOT_FOUND", "Notification preferences not found");
    }

    return {
      mailNotifications: row.mail_notifications,
      demandNotifications: row.demand_notifications,
      nightModeAlerts: row.night_mode_alerts
    };
  },

  async saveFcmToken(driverId: string, token: string) {
    await query(
      `UPDATE notification_preferences
       SET fcm_token = $2, updated_at = NOW()
       WHERE driver_id = $1`,
      [driverId, token]
    );
  },

  async submitFeedback(
    driverId: string,
    payload: {
      hotspotId: string;
      navigationSessionId?: string;
      feedbackScore?: number;
      worthIt?: boolean;
      waitTimeMinutes?: number;
      actedOn?: boolean;
      tripsCompleted?: number;
      estimatedEarnings?: number;
      rating?: number;
      notes?: string;
    }
  ) {
    await query(
      `INSERT INTO prediction_feedback (
         driver_id,
         hotspot_id,
         navigation_session_id,
         feedback_score,
         worth_it,
         wait_time_minutes,
         acted_on,
         trips_completed,
         estimated_earnings,
         rating,
         notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        driverId,
        payload.hotspotId,
        payload.navigationSessionId ?? null,
        payload.feedbackScore ?? payload.rating ?? null,
        payload.worthIt ?? null,
        payload.waitTimeMinutes ?? null,
        payload.actedOn ?? false,
        payload.tripsCompleted ?? 0,
        payload.estimatedEarnings ?? null,
        payload.rating ?? null,
        payload.notes ?? null
      ]
    );
  }
};
