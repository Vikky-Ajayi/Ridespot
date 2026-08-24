import { Job, Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { refreshAllRestaurantVenues } from "../services/osmPlaces.service.js";
import { recomputeRestaurantClusters } from "../services/restaurantClustering.service.js";
import { refreshDeliveryHotspots } from "../services/deliveryHotspotGeneration.service.js";
import { eventsService } from "../modules/events/events.service.js";

export const RESTAURANT_QUEUE_NAME = "restaurant-clusters";
export const restaurantQueue = new Queue(RESTAURANT_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

// Two very different cadences on purpose:
//  - restaurant *locations* barely change day to day, so the expensive Overpass pull +
//    reclustering runs weekly.
//  - the delivery *demand score* (time-of-day weighting, live driver counts, the rolling
//    active-time window that keeps hotspots inside hotspotService's "within 24 hours"
//    query filter) needs to stay fresh, so it runs on the same 5-minute cadence as the
//    taxi hotspot refresh.
const RESTAURANT_JOB_SCHEDULES = [
  { name: "restaurant-location-refresh", pattern: "0 3 * * 1" }, // weekly, Monday 03:00
  { name: "restaurant-score-refresh", pattern: "*/5 * * * *" }
] as const;

export async function ensureRestaurantClusterSchedule() {
  for (const schedule of RESTAURANT_JOB_SCHEDULES) {
    await restaurantQueue.add(
      schedule.name,
      {},
      {
        jobId: `${schedule.name}-schedule`,
        repeat: { pattern: schedule.pattern },
        removeOnComplete: true,
        removeOnFail: 50
      }
    );
  }
}

async function recordRun(input: {
  jobName: string;
  status?: "success" | "failed";
  providerCounts?: Record<string, unknown>;
  errorMessage?: string | null;
  startedAt: Date;
}) {
  try {
    await eventsService.recordPipelineRun({
      jobName: input.jobName,
      status: input.status ?? "success",
      providerCounts: input.providerCounts ?? {},
      rejectedMissingVenue: 0,
      enrichedCount: 0,
      generatedHotspots: 0,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "restaurant_pipeline_run_record_failed",
        jobName: input.jobName,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
  }
}

async function runLocationRefreshCycle() {
  const startedAt = new Date();
  const regionResults = await refreshAllRestaurantVenues();
  const clusterSummary = await recomputeRestaurantClusters();

  await recordRun({
    jobName: "restaurant-location-refresh",
    providerCounts: { regions: regionResults, clusters: clusterSummary },
    startedAt
  });

  console.info(
    JSON.stringify({
      event: "restaurant_location_refresh_completed",
      regions: regionResults,
      clusters: clusterSummary
    })
  );

  return { regionResults, clusterSummary };
}

async function runScoreRefreshCycle() {
  const startedAt = new Date();
  const result = await refreshDeliveryHotspots();

  await recordRun({
    jobName: "restaurant-score-refresh",
    providerCounts: result,
    startedAt
  });

  return result;
}

export function createRestaurantClusterWorker() {
  return new Worker(
    RESTAURANT_QUEUE_NAME,
    async (job: Job) => {
      try {
        if (job.name === "restaurant-location-refresh") {
          return await runLocationRefreshCycle();
        }

        return await runScoreRefreshCycle();
      } catch (error) {
        await recordRun({
          jobName: job.name,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown restaurant worker error",
          startedAt: new Date()
        });
        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      // The weekly location-refresh cycle crawls Overpass across 14 regions and can run
      // long -- give it real headroom instead of the BullMQ default.
      lockDuration: 30 * 60 * 1000
    }
  );
}
