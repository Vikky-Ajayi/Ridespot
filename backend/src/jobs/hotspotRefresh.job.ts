import { Job, Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { eventsService } from "../modules/events/events.service.js";
import { hotspotService } from "../modules/hotspot/hotspot.service.js";
import { notificationsService } from "../modules/notifications/notifications.service.js";
import { generateHotspotsFromEvents as generateHotspotsForEventRows } from "../services/hotspotGeneration.service.js";
import { getHotspotsWithCoverage, type HotspotCoverage } from "../utils/geospatial.js";
import { getSocketServer } from "../websocket/socket.server.js";
import { broadcastHotspotUpdate } from "../websocket/hotspot.handler.js";

export const HOTSPOT_QUEUE_NAME = "hotspots";
export const hotspotQueue = new Queue(HOTSPOT_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

const SYSTEM_NOTIFICATION_DRIVER_ID = "00000000-0000-4000-8000-000000000000";

export async function ensureHotspotRefreshSchedule() {
  await hotspotQueue.add(
    "refresh",
    {},
    {
      repeat: {
        pattern: "*/5 * * * *"
      },
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
}

async function generateHotspotsFromActiveEvents() {
  const upcomingEvents = await eventsService.getActiveEventsWindow();

  console.info(
    JSON.stringify({
      event: "hotspot_refresh_active_events_loaded",
      activeEvents: upcomingEvents.length
    })
  );

  const hotspots = await generateHotspotsForEventRows(upcomingEvents);

  const fallbackCount = hotspots.filter(
    (hotspot) => hotspot.predictionMode === "conservative-fallback"
  ).length;

  console.info(
    JSON.stringify({
      event: "hotspot_refresh_generated",
      generatedHotspots: hotspots.length,
      mlFallbackHotspots: fallbackCount
    })
  );

  return hotspots;
}

function groupCoverageByMarket(hotspots: HotspotCoverage[]) {
  const groups = new Map<string, HotspotCoverage[]>();

  for (const hotspot of hotspots) {
    const key = `${hotspot.city ?? "global"}|${hotspot.country ?? ""}`;
    const existing = groups.get(key) ?? [];
    existing.push(hotspot);
    groups.set(key, existing);
  }

  return [...groups.values()];
}

export async function runHotspotRefreshCycle() {
  const generatedHotspots = await generateHotspotsFromActiveEvents();

  const refreshedHotspots = await hotspotService.listBroadcastHotspots();

  try {
    const io = getSocketServer();
    const cities = ["Lagos", "Abuja", "London", "Manchester", "Birmingham"];
    for (const city of cities) {
      const cityHotspots = refreshedHotspots.filter((hotspot) => hotspot.city === city);
      if (cityHotspots.length) {
        broadcastHotspotUpdate(
          io,
          { city, country: cityHotspots[0]?.country ?? null },
          cityHotspots
        );
      }
    }
  } catch {
    // API process may not be running in the worker context.
  }

  const coverageHotspots = await getHotspotsWithCoverage();
  for (const group of groupCoverageByMarket(coverageHotspots)) {
    const first = group[0];
    await notificationsService.evaluateAndNotify(
      group,
      SYSTEM_NOTIFICATION_DRIVER_ID,
      first?.city ?? null,
      first?.country ?? null
    );
  }

  const summary = {
    generated: generatedHotspots.length,
    refreshed: refreshedHotspots.length,
    evaluatedCoverage: coverageHotspots.length
  };

  console.info(
    JSON.stringify({
      event: "hotspot_refresh_cycle_completed",
      ...summary
    })
  );

  return summary;
}

export function createHotspotRefreshWorker() {
  return new Worker(
    HOTSPOT_QUEUE_NAME,
    async (_job: Job) => runHotspotRefreshCycle(),
    {
      connection: getRedisConnectionOptions()
    }
  );
}
