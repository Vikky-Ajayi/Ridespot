import axios from "axios";
import { env } from "../config/env.js";
import { normaliseEventbriteEvent, type EventInput } from "../utils/normalise.js";

const eventbriteClient = axios.create({
  baseURL: "https://www.eventbriteapi.com/v3",
  timeout: 10000
});

const EVENTBRITE_CACHE_TTL_MS = 5 * 60 * 1000;
const EVENTBRITE_MAX_PAGES = 3;
const EVENTBRITE_PAGE_SIZE = 50;

let accountEventsCache: { expiresAt: number; events: Array<Record<string, unknown>> } | null = null;
let accountEventsRequest: Promise<Array<Record<string, unknown>>> | null = null;

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

function eventVenueId(raw: Record<string, unknown>) {
  return typeof raw.venue_id === "string" && raw.venue_id.length > 0 ? raw.venue_id : null;
}

async function fetchVenue(venueId: string) {
  const response = await eventbriteClient.get(`/venues/${venueId}/`, {
    headers: eventbriteHeaders()
  });

  return response.data && typeof response.data === "object"
    ? (response.data as Record<string, unknown>)
    : null;
}

async function hydrateEventVenue(raw: Record<string, unknown>) {
  const currentVenue = raw.venue;
  if (currentVenue && typeof currentVenue === "object") {
    return raw;
  }

  const venueId = eventVenueId(raw);
  if (!venueId) {
    return raw;
  }

  try {
    const venue = await fetchVenue(venueId);
    return venue ? { ...raw, venue } : raw;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Eventbrite venue error";
    console.warn(
      JSON.stringify({
        event: "eventbrite_venue_unavailable",
        venueId,
        message
      })
    );
    return raw;
  }
}

async function fetchOrganizationEvents(organizationId: string) {
  const events: Array<Record<string, unknown>> = [];
  let continuation: string | undefined;
  let pagesFetched = 0;

  do {
    const response = await eventbriteClient.get(`/organizations/${organizationId}/events/`, {
      headers: eventbriteHeaders(),
      params: {
        time_filter: "current_future",
        page_size: EVENTBRITE_PAGE_SIZE,
        continuation
      }
    });
    pagesFetched += 1;

    if (Array.isArray(response.data?.events)) {
      events.push(...response.data.events);
    }

    const pagination = response.data?.pagination;
    continuation =
      pagination?.has_more_items && typeof pagination?.continuation === "string"
        ? pagination.continuation
        : undefined;
  } while (continuation && pagesFetched < EVENTBRITE_MAX_PAGES);

  return Promise.all(events.map((event) => hydrateEventVenue(event)));
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

  if (!accountEventsCache || accountEventsCache.expiresAt <= Date.now()) {
    accountEventsRequest ??= (async () => {
      const organizationIds = await getOrganizationIds();
      if (!organizationIds.length) {
        console.warn(
          JSON.stringify({
            event: "eventbrite_no_organizations",
            message: "Eventbrite token is valid, but no organizations are available for event ingestion."
          })
        );
        return [] as Array<Record<string, unknown>>;
      }

      return (await Promise.all(organizationIds.map((id) => fetchOrganizationEvents(id)))).flat();
    })();

    accountEventsCache = {
      expiresAt: Date.now() + EVENTBRITE_CACHE_TTL_MS,
      events: await accountEventsRequest.finally(() => {
        accountEventsRequest = null;
      })
    };
  }

  const targetCity = city.trim().toLowerCase();
  const events = accountEventsCache.events.filter((event) => rawEventCity(event) === targetCity);
  const normalisedEvents = events
    .map((event: Record<string, unknown>) => normaliseEventbriteEvent(event))
    .filter((event: EventInput | null): event is EventInput => Boolean(event));

  if (events.length > 0 && normalisedEvents.length === 0) {
    console.warn(
      JSON.stringify({
        event: "eventbrite_events_not_normalisable",
        city,
        rawEventCount: events.length,
        message: "Eventbrite events were found, but none had the venue coordinates required for hotspot generation."
      })
    );
  }

  return normalisedEvents;
}
