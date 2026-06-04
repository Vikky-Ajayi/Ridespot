import axios from "axios";
import { env } from "../config/env.js";
import { normaliseEventbriteEvent, type EventInput } from "../utils/normalise.js";

const eventbriteClient = axios.create({
  baseURL: "https://www.eventbriteapi.com/v3",
  timeout: 15000
});

export async function fetchEventbriteEvents(city: string) {
  if (!env.EVENTBRITE_API_KEY) {
    return [] as EventInput[];
  }

  const response = await eventbriteClient.get("/events/search/", {
    headers: {
      Authorization: `Bearer ${env.EVENTBRITE_API_KEY}`
    },
    params: {
      "location.address": city,
      "location.within": "25km",
      "start_date.range_start": new Date().toISOString(),
      "start_date.range_end": new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      expand: "venue,ticket_availability"
    }
  });

  const events = Array.isArray(response.data?.events) ? response.data.events : [];

  return events
    .map((event: Record<string, unknown>) => normaliseEventbriteEvent(event))
    .filter((event: EventInput | null): event is EventInput => Boolean(event));
}
