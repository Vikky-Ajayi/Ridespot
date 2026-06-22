import { query } from "../../config/database.js";
import { sendToMany, type PushNotificationPayload } from "../../services/fcm.service.js";
import { getDriversInZone, type HotspotCoverage } from "../../utils/geospatial.js";
import { AppError } from "../../utils/http.js";
import { getSocketServer } from "../../websocket/socket.server.js";
import { getCachedMarketConfig } from "../admin/admin.service.js";

type PlanTier = "free" | "pro" | "fleet";
type NotificationType = "hotspot_alert" | "coverage_sufficient" | "surge_alert" | "system" | "test";
type AlertCandidate = {
  id: string;
  fcm_token: string | null;
  night_mode_alerts: boolean;
  distance_meters: number;
};
type NotificationRow = {
  id: string;
  driver_id: string | null;
  hotspot_id: string | null;
  type: NotificationType;
  title: string | null;
  body: string | null;
  was_delivered: boolean;
  was_acted_on: boolean;
  read_at: Date | string | null;
  sent_at: Date | string;
  data: Record<string, unknown> | null;
};

function mapNotification(row: NotificationRow) {
  return {
    id: row.id,
    driverId: row.driver_id,
    hotspotId: row.hotspot_id,
    type: row.type,
    title: row.title ?? "RideSpot",
    body: row.body ?? "",
    wasDelivered: row.was_delivered,
    wasActedOn: row.was_acted_on,
    isRead: Boolean(row.read_at),
    readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
    sentAt: new Date(row.sent_at).toISOString(),
    data: row.data ?? {}
  };
}

function marketRoom(city: string | null) {
  return city ? `market:${city.toLowerCase().replace(/\s+/g, "-")}` : "market:global";
}

function isLateNightHour() {
  const hour = new Date().getHours();
  return hour >= 23 || hour <= 5;
}

async function sendToDrivers(tokens: string[], notification: PushNotificationPayload) {
  if (!tokens.length) {
    return;
  }

  const batchSize = 500;
  for (let index = 0; index < tokens.length; index += batchSize) {
    await sendToMany(tokens.slice(index, index + batchSize), notification);
  }
}

async function logNotifications(
  driverIds: string[],
  hotspotId: string,
  type: NotificationType,
  notification: PushNotificationPayload
) {
  if (!driverIds.length) {
    await query(
      `INSERT INTO notification_logs (hotspot_id, type, title, body, was_delivered, data)
       VALUES ($1, $2, $3, $4, TRUE, $5::jsonb)`,
      [hotspotId, type, notification.title, notification.body, JSON.stringify(notification.data ?? {})]
    );
    return;
  }

  for (const driverId of driverIds) {
    await createDriverNotification({
      driverId,
      hotspotId,
      type,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      wasDelivered: true
    });
  }
}

async function createDriverNotification(payload: {
  driverId: string;
  hotspotId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string> | Record<string, unknown>;
  wasDelivered?: boolean;
}) {
  const result = await query<NotificationRow>(
    `INSERT INTO notification_logs (driver_id, hotspot_id, type, title, body, was_delivered, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING id, driver_id, hotspot_id, type, title, body, was_delivered, was_acted_on, read_at, sent_at, data`,
    [
      payload.driverId,
      payload.hotspotId ?? null,
      payload.type,
      payload.title,
      payload.body,
      payload.wasDelivered ?? false,
      JSON.stringify(payload.data ?? {})
    ]
  );
  const row = result.rows[0];
  if (!row) {
    throw new AppError(500, "INTERNAL_SERVER_ERROR", "Notification could not be created");
  }
  const notification = mapNotification(row);

  try {
    const io = getSocketServer();
    io.to(`driver:${payload.driverId}`).emit("notification:new", notification);
  } catch {
    // Worker-only contexts can persist notifications without a Socket.io server.
  }

  return notification;
}

async function getDriversToAlert(
  hotspot: HotspotCoverage,
  triggeringDriverId: string
): Promise<AlertCandidate[]> {
  const marketConfig = hotspot.city ? await getCachedMarketConfig(hotspot.city) : null;
  const alertRadiusMeters = marketConfig?.alertRadiusMeters ?? 25000;
  const result = await query<AlertCandidate>(
    `SELECT
       d.id,
       np.fcm_token,
       np.night_mode_alerts,
       ST_Distance(
         dl.location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
       ) AS distance_meters
     FROM drivers d
     JOIN notification_preferences np ON np.driver_id = d.id
     JOIN driver_locations dl ON dl.driver_id = d.id
     WHERE dl.is_online = TRUE
       AND dl.last_seen > NOW() - INTERVAL '5 minutes'
       AND np.fcm_token IS NOT NULL
       AND np.demand_notifications = TRUE
       AND d.id <> $3
       AND d.id NOT IN (
         SELECT driver_id FROM driver_coverage WHERE hotspot_id = $4
       )
       AND ST_DWithin(
         dl.location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $5
       )
     ORDER BY distance_meters ASC
     LIMIT 50`,
    [hotspot.lng, hotspot.lat, triggeringDriverId, hotspot.id, alertRadiusMeters]
  );

  return result.rows;
}

async function handleZoneNeedsDrivers(
  hotspot: HotspotCoverage,
  currentDrivers: number,
  city: string | null,
  country: string | null,
  triggeringDriverId: string
) {
  if (hotspot.routing_decision !== "go") {
    return { alerted: 0, skipped: "not_actionable" };
  }

  const candidates = await getDriversToAlert(hotspot, triggeringDriverId);
  const eligibleDrivers = isLateNightHour()
    ? candidates.filter((driver) => driver.night_mode_alerts)
    : candidates;

  if (!eligibleDrivers.length) {
    return { alerted: 0 };
  }

  const demandLabel = hotspot.demand_level.replace("-", " ");
  const notification = {
    title: `${demandLabel} demand near you`,
    body: `${hotspot.name} needs ${Math.max(hotspot.drivers_needed - currentDrivers, 0)} more drivers. ${
      hotspot.insight_text?.split(".")[0] ?? ""
    }`,
    data: {
      type: "hotspot_alert",
      hotspotId: hotspot.id,
      lat: String(hotspot.lat),
      lng: String(hotspot.lng),
      demandLevel: hotspot.demand_level
    }
  } satisfies PushNotificationPayload;

  await sendToDrivers(
    eligibleDrivers.map((driver) => driver.fcm_token).filter((token): token is string => Boolean(token)),
    notification
  );

  try {
    const io = getSocketServer();
    io.to(marketRoom(city)).emit("hotspot:alert", {
      hotspot,
      driversNeeded: Math.max(hotspot.drivers_needed - currentDrivers, 0),
      notification
    });
  } catch {
    // Worker-only contexts can send push/log notifications without a Socket.io server.
  }

  await logNotifications(
    eligibleDrivers.map((driver) => driver.id),
    hotspot.id,
    "hotspot_alert",
    notification
  );

  return { alerted: eligibleDrivers.length, country };
}

async function handleZoneCovered(
  hotspot: HotspotCoverage,
  driversInZone: number,
  city: string | null
) {
  const notification = {
    title: "Zone now covered",
    body: `${hotspot.name} has sufficient driver coverage. Consider nearby zones instead.`,
    data: {
      type: "coverage_sufficient",
      hotspotId: hotspot.id
    }
  } satisfies PushNotificationPayload;

  try {
    const io = getSocketServer();
    io.to(marketRoom(city)).emit("hotspot:covered", {
      hotspotId: hotspot.id,
      driversInZone,
      message: notification.body
    });
  } catch {
    // Worker-only contexts can still log coverage transitions.
  }

  await logNotifications([], hotspot.id, "coverage_sufficient", notification);
  return { covered: true };
}

async function sendSurgeAlert(hotspot: HotspotCoverage, city: string | null) {
  if (hotspot.routing_decision !== "go" || hotspot.demand_score < 80) {
    return { sent: 0 };
  }

  const result = await query<{ id: string; fcm_token: string | null }>(
    `SELECT d.id, np.fcm_token
     FROM drivers d
     JOIN notification_preferences np ON np.driver_id = d.id
     JOIN driver_locations dl ON dl.driver_id = d.id
     WHERE d.plan_tier IN ('pro', 'fleet')
       AND dl.is_online = TRUE
       AND dl.last_seen > NOW() - INTERVAL '5 minutes'
       AND np.fcm_token IS NOT NULL
       AND ST_DWithin(
         dl.location,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         30000
       )`,
    [hotspot.lng, hotspot.lat]
  );

  if (!result.rows.length) {
    return { sent: 0 };
  }

  const notification = {
    title: "Surge demand activated",
    body: `${hotspot.name} - score ${Math.round(hotspot.demand_score)}/100. Drivers earning 3x now.`,
    data: {
      type: "surge_alert",
      hotspotId: hotspot.id,
      demandScore: String(Math.round(hotspot.demand_score))
    }
  } satisfies PushNotificationPayload;

  await sendToDrivers(
    result.rows.map((driver) => driver.fcm_token).filter((token): token is string => Boolean(token)),
    notification
  );

  try {
    const io = getSocketServer();
    io.to(marketRoom(city)).emit("hotspot:alert", {
      hotspot,
      driversNeeded: Math.max(hotspot.drivers_needed - hotspot.drivers_in_zone, 0),
      notification
    });
  } catch {
    // Worker-only contexts can send push/log notifications without a Socket.io server.
  }

  await logNotifications(
    result.rows.map((driver) => driver.id),
    hotspot.id,
    "surge_alert",
    notification
  );

  return { sent: result.rows.length };
}

export const notificationsService = {
  async getEligibleTokens(country?: string | null, minimumPlanTier?: PlanTier) {
    const result = await query<{ fcm_token: string }>(
      `SELECT np.fcm_token
       FROM notification_preferences np
       JOIN drivers d ON d.id = np.driver_id
       WHERE np.demand_notifications = TRUE
         AND np.fcm_token IS NOT NULL
         AND ($1::text IS NULL OR d.country = $1)
         AND (
           $2::text IS NULL
           OR ($2 = 'pro' AND d.plan_tier IN ('pro', 'fleet'))
           OR ($2 = 'fleet' AND d.plan_tier = 'fleet')
           OR ($2 = 'free')
         )`,
      [country ?? null, minimumPlanTier ?? null]
    );

    return result.rows.map((row) => row.fcm_token);
  },

  async logNotification(payload: {
    driverId?: string | null;
    hotspotId?: string | null;
    type: NotificationType;
    title: string;
    body: string;
    data?: Record<string, string>;
    wasDelivered?: boolean;
  }) {
    if (payload.driverId) {
      await createDriverNotification({
        driverId: payload.driverId,
        hotspotId: payload.hotspotId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        wasDelivered: payload.wasDelivered
      });
      return;
    }

    await query(
      `INSERT INTO notification_logs (driver_id, hotspot_id, type, title, body, was_delivered, data)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        null,
        payload.hotspotId ?? null,
        payload.type,
        payload.title,
        payload.body,
        payload.wasDelivered ?? false,
        JSON.stringify(payload.data ?? {})
      ]
    );
  },

  async listDriverNotifications(driverId: string, limit = 30) {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const result = await query<NotificationRow>(
      `SELECT id, driver_id, hotspot_id, type, title, body, was_delivered, was_acted_on,
              read_at, sent_at, data
       FROM notification_logs
       WHERE driver_id = $1
       ORDER BY sent_at DESC
       LIMIT $2`,
      [driverId, safeLimit]
    );
    const unread = await this.getUnreadCount(driverId);

    return {
      notifications: result.rows.map(mapNotification),
      unreadCount: unread.unreadCount
    };
  },

  async getUnreadCount(driverId: string) {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM notification_logs
       WHERE driver_id = $1
         AND read_at IS NULL`,
      [driverId]
    );

    return { unreadCount: Number(result.rows[0]?.count ?? 0) };
  },

  async markRead(driverId: string, notificationId: string) {
    const result = await query<NotificationRow>(
      `UPDATE notification_logs
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1
         AND driver_id = $2
       RETURNING id, driver_id, hotspot_id, type, title, body, was_delivered, was_acted_on,
                 read_at, sent_at, data`,
      [notificationId, driverId]
    );

    if (!result.rows[0]) {
      throw new AppError(404, "NOT_FOUND", "Notification not found");
    }

    return mapNotification(result.rows[0]);
  },

  async markAllRead(driverId: string) {
    const result = await query<{ count: string }>(
      `WITH updated AS (
         UPDATE notification_logs
         SET read_at = COALESCE(read_at, NOW())
         WHERE driver_id = $1
           AND read_at IS NULL
         RETURNING id
       )
       SELECT COUNT(*)::text AS count FROM updated`,
      [driverId]
    );

    return { updated: Number(result.rows[0]?.count ?? 0) };
  },

  async createTestNotification(driverId: string) {
    return createDriverNotification({
      driverId,
      type: "test",
      title: "RideSpot notifications are live",
      body: "You will receive hotspot alerts here just like a mobile app.",
      data: { type: "test" },
      wasDelivered: true
    });
  },

  async sendBulkNotification(options: {
    country?: string | null;
    minimumPlanTier?: PlanTier;
    payload: PushNotificationPayload;
  }) {
    const tokens = await this.getEligibleTokens(options.country, options.minimumPlanTier);
    if (!tokens.length) {
      return { sent: 0 };
    }

    await sendToDrivers(tokens, options.payload);
    return { sent: tokens.length };
  },

  async evaluateAndNotify(
    hotspots: HotspotCoverage[],
    triggeringDriverId: string,
    city: string | null,
    country: string | null
  ) {
    let evaluated = 0;

    for (const hotspot of hotspots) {
      const { count: driversInZone } = await getDriversInZone(
        hotspot.id,
        hotspot.lat,
        hotspot.lng,
        hotspot.radius_meters
      );

      const wasCovered = hotspot.isCovered;
      const isCoveredNow = driversInZone >= hotspot.drivers_needed;
      const coveragePercent = Math.round((driversInZone / Math.max(hotspot.drivers_needed, 1)) * 100);

      if (!wasCovered && isCoveredNow) {
        await handleZoneCovered(hotspot, driversInZone, city);
      } else if (!isCoveredNow && coveragePercent < 50) {
        await handleZoneNeedsDrivers(
          hotspot,
          driversInZone,
          city,
          country,
          triggeringDriverId
        );
      }

      await sendSurgeAlert(
        {
          ...hotspot,
          drivers_in_zone: driversInZone,
          isCovered: isCoveredNow,
          coverageRatio: driversInZone / Math.max(hotspot.drivers_needed, 1)
        },
        city
      );

      evaluated += 1;
    }

    return { evaluated };
  }
};
