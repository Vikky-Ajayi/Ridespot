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

export async function fetchTicketmasterEvents(city: string, countryCode: "GB" | "NG") {
  if (!env.TICKETMASTER_API_KEY) {
    return [] as EventInput[];
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const response = await ticketmasterClient.get("/events.json", {
    params: {
      apikey: env.TICKETMASTER_API_KEY,
      city,
      countryCode,
      startDateTime: ticketmasterDateTime(now),
      endDateTime: ticketmasterDateTime(sevenDaysFromNow),
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
