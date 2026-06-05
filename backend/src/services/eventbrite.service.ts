import axios from "axios";
import { env } from "../config/env.js";
import { normaliseEventbriteEvent, type EventInput } from "../utils/normalise.js";

const eventbriteClient = axios.create({
  baseURL: "https://www.eventbriteapi.com/v3",
  timeout: 15000
});

function eventbriteHeaders() {
  return {
    Authorization: `Bearer ${env.EVENTBRITE_API_KEY}`
  };
}

async function getOrganizationIds(): Promise<string[]> {
  const response = await eventbriteClient.get("/users/me/organizations/", {
    headers: eventbriteHeaders()
  });

  const organizations: Array<Record<string, unknown>> = Array.isArray(response.data?.organizations)
    ? response.data.organizations
    : [];

  return organizations
    .map((organization: Record<string, unknown>) => organization.id)
    .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
}

async function fetchOrganizationEvents(organizationId: string) {
  const events: Array<Record<string, unknown>> = [];
  let continuation: string | undefined;

  do {
    const response = await eventbriteClient.get(`/organizations/${organizationId}/events/`, {
      headers: eventbriteHeaders(),
      params: {
        expand: "venue,ticket_availability,category",
        time_filter: "current_future",
        continuation
      }
    });

    if (Array.isArray(response.data?.events)) {
      events.push(...response.data.events);
    }

    const pagination = response.data?.pagination;
    continuation =
      pagination?.has_more_items && typeof pagination?.continuation === "string"
        ? pagination.continuation
        : undefined;
  } while (continuation);

  return events;
}

function rawEventCity(raw: Record<string, unknown>) {
  const venue = (raw.venue as Record<string, unknown> | undefined) ?? {};
  const address = (venue.address as Record<string, unknown> | undefined) ?? {};
  return typeof address.city === "string" ? address.city.trim().toLowerCase() : "";
}

export async function fetchEventbriteEvents(city: string) {
  if (!env.EVENTBRITE_API_KEY) {
    return [] as EventInput[];
  }

  const organizationIds = await getOrganizationIds();
  if (!organizationIds.length) {
    console.warn(
      JSON.stringify({
        event: "eventbrite_no_organizations",
        message: "Eventbrite token is valid, but no organizations are available for event ingestion."
      })
    );
    return [] as EventInput[];
  }

  const targetCity = city.trim().toLowerCase();
  const events = (
    await Promise.all(organizationIds.map((id) => fetchOrganizationEvents(id)))
  )
    .flat()
    .filter((event) => rawEventCity(event) === targetCity);

  return events
    .map((event: Record<string, unknown>) => normaliseEventbriteEvent(event))
    .filter((event: EventInput | null): event is EventInput => Boolean(event));
}
