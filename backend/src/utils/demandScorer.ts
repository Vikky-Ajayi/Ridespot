export type DemandLevel = "very-high" | "high" | "medium" | "low";

export interface DemandScoreInput {
  expectedAttendance?: number | null;
  trafficScore?: number | null;
  popularityScore?: number | null;
  currentDrivers?: number | null;
  country?: string | null;
  venueName?: string | null;
}

export interface DemandScoreResult {
  demandLevel: DemandLevel;
  demandScore: number;
  liveScore: number;
  driverSaturation: "LOW" | "MEDIUM" | "HIGH";
  insightText: string;
}

export function scoreDemand(input: DemandScoreInput): DemandScoreResult {
  const attendanceScore = Math.min(60, Math.max(0, (input.expectedAttendance ?? 0) / 20));
  const trafficScore = Math.min(20, Math.max(0, input.trafficScore ?? 0));
  const popularityScore = Math.min(20, Math.max(0, input.popularityScore ?? 0));
  const rawScore = Math.min(100, Math.round(attendanceScore + trafficScore + popularityScore));
  const liveScore = Math.max(15, rawScore);
  const currentDrivers = input.currentDrivers ?? 0;

  let demandLevel: DemandLevel = "low";
  if (liveScore >= 85) {
    demandLevel = "very-high";
  } else if (liveScore >= 70) {
    demandLevel = "high";
  } else if (liveScore >= 45) {
    demandLevel = "medium";
  }

  const driverSaturation =
    currentDrivers >= 6 ? "HIGH" : currentDrivers >= 3 ? "MEDIUM" : "LOW";

  const venue = input.venueName ?? "this area";
  const insightText =
    demandLevel === "very-high" || demandLevel === "high"
      ? `${venue} is at peak demand, with significantly higher rider activity than average right now.`
      : demandLevel === "medium"
        ? `${venue} is showing moderate demand with room for additional drivers.`
        : `${venue} is currently showing low demand. Consider nearby higher activity zones.`;

  return {
    demandLevel,
    demandScore: Number((liveScore / 1.05).toFixed(2)),
    liveScore,
    driverSaturation,
    insightText
  };
}
