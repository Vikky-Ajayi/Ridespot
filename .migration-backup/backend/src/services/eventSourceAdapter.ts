import type { EventInput } from "../utils/normalise.js";

export interface EventSourceFetchInput {
  lat: number;
  lng: number;
  radiusMeters: number;
  city?: string | null;
  country?: string | null;
  startTime?: Date;
  endTime?: Date;
}

export type EventSourceStatus = "ok" | "disabled" | "unavailable" | "failed";

export interface EventSourceDiagnostic {
  source: string;
  status: EventSourceStatus;
  found: number;
  normalised: number;
  rejected: number;
  geocoded: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface EventSourceResult {
  events: EventInput[];
  diagnostics: EventSourceDiagnostic[];
}

export interface EventSourceAdapter {
  name: string;
  fetchEventsNear(input: EventSourceFetchInput): Promise<EventSourceResult>;
}
