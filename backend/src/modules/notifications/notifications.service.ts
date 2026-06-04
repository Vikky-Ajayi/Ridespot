import { query } from "../../config/database.js";
import { sendToMany, type PushNotificationPayload } from "../../services/fcm.service.js";
import { getDriversInZone, type HotspotCoverage } from "../../utils/geospatial.js";
import { getSocketServer } from "../../websocket/socket.server.js";
import { getCachedMarketConfig } from "../admin/admin.service.js";

type PlanTier = "free" | "pro" | "fleet";
type AlertCandidate = {
  id: string;
  fcm_token: string | null;
  night_mode_alerts: boolean;
  distance_meters: number;
};

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
  type: "hotspot_alert" | "coverage_sufficient" | "surge_alert",
  notification: PushNotificationPayload
) {
  if (!driverIds.length) {
    await query(
      `INSERT INTO notification_logs (hotspot_id, type, title, body, was_delivered)
       VALUES ($1, $2, $3, $4, TRUE)`,
      [hotspotId, type, notification.title, notification.body]
    );
    return;
  }

  for (const driverId of driverIds) {
    await query(
      `INSERT INTO notification_logs (driver_id, hotspot_id, type, title, body, was_delivered)
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [driverId, hotspotId, type, notification.title, notification.body]
    );
  }
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
    type: "hotspot_alert" | "coverage_sufficient" | "surge_alert";
    title: string;
    body: string;
    wasDelivered?: boolean;
  }) {
    await query(
      `INSERT INTO notification_logs (driver_id, hotspot_id, type, title, body, was_delivered)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        payload.driverId ?? null,
        payload.hotspotId ?? null,
        payload.type,
        payload.title,
        payload.body,
        payload.wasDelivered ?? false
      ]
    );
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
