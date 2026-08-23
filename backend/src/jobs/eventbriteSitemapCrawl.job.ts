import { Job, Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { refreshEventbriteSitemapIndex, crawlEventbriteSitemapBatch } from "../services/eventbriteSitemap.service.js";
import { eventsService } from "../modules/events/events.service.js";

export const EVENTBRITE_SITEMAP_QUEUE_NAME = "eventbrite-sitemap";
export const eventbriteSitemapQueue = new Queue(EVENTBRITE_SITEMAP_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

const SITEMAP_JOB_SCHEDULES = [
  { name: "sitemap-url-refresh", pattern: "0 2 * * *" }, // daily -- re-index the shard list
  { name: "sitemap-page-crawl", pattern: "*/5 * * * *" } // frequent, bounded batches
] as const;

export async function ensureEventbriteSitemapSchedule() {
  for (const schedule of SITEMAP_JOB_SCHEDULES) {
    await eventbriteSitemapQueue.add(
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
        event: "eventbrite_sitemap_pipeline_run_record_failed",
        jobName: input.jobName,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
  }
}

export function createEventbriteSitemapWorker() {
  return new Worker(
    EVENTBRITE_SITEMAP_QUEUE_NAME,
    async (job: Job) => {
      const startedAt = new Date();
      try {
        const result =
          job.name === "sitemap-url-refresh"
            ? await refreshEventbriteSitemapIndex()
            : await crawlEventbriteSitemapBatch();

        await recordRun({ jobName: job.name, providerCounts: result, startedAt });
        return result;
      } catch (error) {
        await recordRun({
          jobName: job.name,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown sitemap crawler error",
          startedAt
        });
        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      // The daily shard refresh downloads and parses ~5 gzipped sitemap files sequentially.
      lockDuration: 15 * 60 * 1000
    }
  );
}
