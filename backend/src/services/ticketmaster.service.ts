import axios from "axios";
import { env } from "../config/env.js";
import { normaliseTicketmasterEvent, type EventInput } from "../utils/normalise.js";

const ticketmasterClient = axios.create({
  baseURL: "https://app.ticketmaster.com/discovery/v2",
  timeout: 15000
});

function ticketmasterDateTime(date: Date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function fetchTicketmasterEvents(
  city: string,
  countryCode: "GB" | "NG",
  input: { startTime?: Date; endTime?: Date } = {}
) {
  if (!env.TICKETMASTER_API_KEY) {
    return [] as EventInput[];
  }

  const now = new Date();
  const startTime = input.startTime ?? now;
  const endTime = input.endTime ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const response = await ticketmasterClient.get("/events.json", {
    params: {
      apikey: env.TICKETMASTER_API_KEY,
      city,
      countryCode,
      startDateTime: ticketmasterDateTime(startTime),
      endDateTime: ticketmasterDateTime(endTime),
      size: 200
    }
  });

  const events =
    response.data?._embedded?.events && Array.isArray(response.data._embedded.events)
      ? response.data._embedded.events
      : [];

  return events
    .map((event: Record<string, unknown>) => normaliseTicketmasterEvent(event))
    .filter((event: EventInput | null): event is EventInput => Boolean(event));
}

export async function fetchTicketmasterEventsNear(input: {
  lat: number;
  lng: number;
  radiusMeters: number;
  startTime?: Date;
  endTime?: Date;
}) {
  if (!env.TICKETMASTER_API_KEY) {
    return [] as EventInput[];
  }

  const now = new Date();
  const startTime = input.startTime ?? now;
  const endTime = input.endTime ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const radiusKm = Math.max(1, Math.ceil(input.radiusMeters / 1000));

  const response = await ticketmasterClient.get("/events.json", {
    params: {
      apikey: env.TICKETMASTER_API_KEY,
      latlong: `${input.lat},${input.lng}`,
      radius: radiusKm,
      unit: "km",
      startDateTime: ticketmasterDateTime(startTime),
      endDateTime: ticketmasterDateTime(endTime),
      size: 200,
      sort: "date,asc"
    }
  });

  const events =
    response.data?._embedded?.events && Array.isArray(response.data._embedded.events)
      ? response.data._embedded.events
      : [];

  return events
    .map((event: Record<string, unknown>) => normaliseTicketmasterEvent(event))
    .filter((event: EventInput | null): event is EventInput => Boolean(event));
}
