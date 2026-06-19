import { Job, Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { eventsService } from "../modules/events/events.service.js";

export const EVENT_QUEUE_NAME = "events";
export const eventQueue = new Queue(EVENT_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

const EVENT_JOB_SCHEDULES = [
  { name: "market-area-discovery", pattern: "*/15 * * * *" },
  { name: "event-enrichment", pattern: "*/30 * * * *" },
  { name: "stale-event-prune", pattern: "15 3 * * *" },
  { name: "feedback-retraining-export", pattern: "0 4 * * 1" }
] as const;

export async function ensureEventIngestionSchedule() {
  for (const schedule of EVENT_JOB_SCHEDULES) {
    await eventQueue.add(
      schedule.name,
      {},
      {
        jobId: `${schedule.name}-schedule`,
        repeat: {
          pattern: schedule.pattern
        },
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
  rejectedMissingVenue?: number;
  enrichedCount?: number;
  generatedHotspots?: number;
  errorMessage?: string | null;
  startedAt: Date;
}) {
  try {
    await eventsService.recordPipelineRun({
      jobName: input.jobName,
      status: input.status ?? "success",
      providerCounts: input.providerCounts ?? {},
      rejectedMissingVenue: input.rejectedMissingVenue ?? 0,
      enrichedCount: input.enrichedCount ?? 0,
      generatedHotspots: input.generatedHotspots ?? 0,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "event_pipeline_run_record_failed",
        jobName: input.jobName,
        error: error instanceof Error ? error.message : "Unknown error"
      })
    );
  }
}

export async function runEventIngestionCycle(jobName = "market-area-discovery") {
  const startedAt = new Date();
  const result = await eventsService.ingestEvents();
  await recordRun({
    jobName,
    providerCounts: {
      total: result.total,
      errors: result.errors.length
    },
    generatedHotspots: 0,
    startedAt
  });
  console.info(
    JSON.stringify({
      event: "event_ingestion_cycle_completed",
      jobName,
      ingestedEvents: result.total,
      errors: result.errors.length,
      errorSources: result.errors.map((item) => `${item.city}:${item.source}`)
    })
  );
  return result;
}

async function runEventEnrichmentCycle() {
  const startedAt = new Date();
  const result = await eventsService.enrichIncompleteEvents();
  await recordRun({
    jobName: "event-enrichment",
    enrichedCount: result.enrichedCount,
    rejectedMissingVenue: 0,
    startedAt
  });
  console.info(
    JSON.stringify({
      event: "event_enrichment_cycle_completed",
      enrichedCount: result.enrichedCount,
      rejectedMissingVenue: 0
    })
  );
  return result;
}

async function runStaleEventPruneCycle() {
  const startedAt = new Date();
  const result = await eventsService.pruneStaleEvents();
  await recordRun({
    jobName: "stale-event-prune",
    providerCounts: {
      prunedEvents: result.pruned
    },
    startedAt
  });
  console.info(
    JSON.stringify({
      event: "stale_event_prune_cycle_completed",
      prunedEvents: result.pruned
    })
  );
  return result;
}

async function runFeedbackRetrainingExportCycle() {
  const startedAt = new Date();
  const result = await eventsService.exportFeedbackForRetraining();
  await recordRun({
    jobName: "feedback-retraining-export",
    providerCounts: {
      exportedFeedbackRows: result.feedbackRecords
    },
    startedAt
  });
  console.info(
    JSON.stringify({
      event: "feedback_retraining_export_cycle_completed",
      exportedRows: result.feedbackRecords
    })
  );
  return result;
}

export function createEventIngestionWorker() {
  return new Worker(
    EVENT_QUEUE_NAME,
    async (job: Job) => {
      try {
        if (job.name === "event-enrichment") {
          return runEventEnrichmentCycle();
        }

        if (job.name === "stale-event-prune") {
          return runStaleEventPruneCycle();
        }

        if (job.name === "feedback-retraining-export") {
          return runFeedbackRetrainingExportCycle();
        }

        return runEventIngestionCycle(job.name);
      } catch (error) {
        await recordRun({
          jobName: job.name,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown event worker error",
          startedAt: new Date()
        });
        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions()
    }
  );
}
