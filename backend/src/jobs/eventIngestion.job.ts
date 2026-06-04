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

export function createEventIngestionWorker() {
  return new Worker(
    EVENT_QUEUE_NAME,
    async (_job: Job) => eventsService.ingestEvents(),
    {
      connection: getRedisConnectionOptions()
    }
  );
}
