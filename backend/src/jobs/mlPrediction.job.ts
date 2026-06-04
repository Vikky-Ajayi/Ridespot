import { Job, Queue, Worker } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { predictHotspotDemand, type PredictionRequest } from "../services/ml.service.js";
import { scoreDemand } from "../utils/demandScorer.js";

export const ML_PREDICTION_QUEUE_NAME = "ml-predictions";
export const mlPredictionQueue = new Queue<PredictionRequest>(ML_PREDICTION_QUEUE_NAME, {
  connection: getRedisConnectionOptions()
});

export async function runPredictionWithFallback(payload: PredictionRequest) {
  try {
    return await predictHotspotDemand(payload);
  } catch {
    return scoreDemand({
      expectedAttendance: payload.event.expectedAttendance,
      trafficScore: payload.trafficScore,
      popularityScore: payload.popularityScore,
      currentDrivers: payload.currentDrivers,
      country: payload.event.country,
      venueName: payload.event.venueName
    });
  }
}

export function createMlPredictionWorker() {
  return new Worker<PredictionRequest>(
    ML_PREDICTION_QUEUE_NAME,
    async (job: Job<PredictionRequest>) => runPredictionWithFallback(job.data),
    {
      connection: getRedisConnectionOptions()
    }
  );
}
