import { Job, Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { eventsService } from "../modules/events/events.service.js";

export const EVENT_QUEUE_NAME = "events";
export const eventQueue = new Queue(EVENT_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

export async function ensureEventIngestionSchedule() {
  await eventQueue.add(
    "ingest",
    {},
    {
      repeat: {
        pattern: "0 */2 * * *"
      },
      removeOnComplete: true,
      removeOnFail: 50
    }
  );
}

export async function runEventIngestionCycle() {
  const result = await eventsService.ingestEvents();
  console.info(
    JSON.stringify({
      event: "event_ingestion_cycle_completed",
      ingestedEvents: result.total,
      errors: result.errors.length,
      errorSources: result.errors.map((item) => `${item.city}:${item.source}`)
    })
  );
  return result;
}

export function createEventIngestionWorker() {
  return new Worker(
    EVENT_QUEUE_NAME,
    async (_job: Job) => runEventIngestionCycle(),
    {
      connection: getRedisConnectionOptions()
    }
  );
}
