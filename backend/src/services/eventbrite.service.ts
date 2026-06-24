import axios from "axios";
import { createHash } from "node:crypto";
import { env } from "../config/env.js";
import {
  type EventSourceDiagnostic,
  type EventSourceFetchInput,
  type EventSourceResult
} from "./eventSourceAdapter.js";
import { geocodeAddress, reverseGeocodeMarket } from "./googleGeocoding.service.js";
import { canonicalMarketCountry } from "../utils/country.js";
import { normaliseEventbriteEvent, type EventInput } from "../utils/normalise.js";

const eventbriteClient = axios.create({
  baseURL: "https://www.eventbriteapi.com/v3",
  timeout: 15000
});

const EVENTBRITE_PAGE_SIZE = 50;

interface MarketSearchContext {
  city: string;
  country: "Nigeria" | "UK";
  lat: number;
  lng: number;
  eventbriteCountrySlug: string;
}

const SUPPORTED_MARKETS: MarketSearchContext[] = [
  {
    city: "Lagos",
    country: "Nigeria",
    lat: 6.5244,
    lng: 3.3792,
    eventbriteCountrySlug: "nigeria"
  },
  {
    city: "Abuja",
    country: "Nigeria",
    lat: 9.0765,
    lng: 7.3986,
    eventbriteCountrySlug: "nigeria"
  },
  {
    city: "London",
    country: "UK",
    lat: 51.5072,
    lng: -0.1276,
    eventbriteCountrySlug: "united-kingdom"
  },
  {
    city: "Manchester",
    country: "UK",
    lat: 53.4808,
    lng: -2.2426,
    eventbriteCountrySlug: "united-kingdom"
  },
  {
    city: "Birmingham",
    country: "UK",
    lat: 52.4862,
    lng: -1.8904,
    eventbriteCountrySlug: "united-kingdom"
  }
];

function eventbriteHeaders() {
  return {
    Authorization: `Bearer ${env.EVENTBRITE_API_KEY}`
  };
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 16);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function diagnostic(input: EventSourceDiagnostic): EventSourceDiagnostic {
  return input;
}

function nearestSupportedMarket(lat: number, lng: number) {
  return SUPPORTED_MARKETS.reduce((best, market) => {
    const distance = distanceMeters(lat, lng, market.lat, market.lng);
    return distance < best.distance ? { market, distance } : best;
  }, { market: SUPPORTED_MARKETS[0]!, distance: Number.POSITIVE_INFINITY }).market;
}

async function resolveMarket(input: EventSourceFetchInput): Promise<MarketSearchContext> {
  const canonicalCountry = canonicalMarketCountry(input.country ?? undefined);
  if (input.city && (canonicalCountry === "Nigeria" || canonicalCountry === "UK")) {
    return {
      city: input.city,
      country: canonicalCountry,
      lat: input.lat,
      lng: input.lng,
      eventbriteCountrySlug: canonicalCountry === "Nigeria" ? "nigeria" : "united-kingdom"
    };
  }

  const geocoded = await reverseGeocodeMarket(input.lat, input.lng);
  const geocodedCountry = canonicalMarketCountry(geocoded?.country ?? undefined);
  if (geocoded?.city && (geocodedCountry === "Nigeria" || geocodedCountry === "UK")) {
    return {
      city: geocoded.city,
      country: geocodedCountry,
      lat: input.lat,
      lng: input.lng,
      eventbriteCountrySlug: geocodedCountry === "Nigeria" ? "nigeria" : "united-kingdom"
    };
  }

  return nearestSupportedMarket(input.lat, input.lng);
}

function rawEventCoordinates(raw: Record<string, unknown>) {
  const venue = (raw.venue as Record<string, unknown> | undefined) ?? {};
  const lat = toNumber(venue.latitude);
  const lng = toNumber(venue.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return { lat, lng };
}

async function fetchEventbriteOfficialDiscoveryNear(
  input: EventSourceFetchInput
): Promise<EventSourceResult> {
  if (!env.EVENTBRITE_OFFICIAL_DISCOVERY_ENABLED) {
    return {
      events: [],
      diagnostics: [
        diagnostic({
          source: "eventbrite_official",
          status: "disabled",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: "EVENTBRITE_OFFICIAL_DISCOVERY_ENABLED is false"
        })
      ]
    };
  }

  if (!env.EVENTBRITE_API_KEY) {
    return {
      events: [],
      diagnostics: [
        diagnostic({
          source: "eventbrite_official",
          status: "disabled",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: "EVENTBRITE_API_KEY is missing"
        })
      ]
    };
  }

  const now = input.startTime ?? new Date();
  const endTime = input.endTime ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const radiusKm = Math.max(1, Math.ceil(input.radiusMeters / 1000));

  const MAX_PAGES = 3;
  const allRawEvents: Array<Record<string, unknown>> = [];
  const diagnostics: EventSourceDiagnostic[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await eventbriteClient.get("/events/search/", {
      headers: eventbriteHeaders(),
      params: {
        "location.latitude": input.lat,
        "location.longitude": input.lng,
        "location.within": `${radiusKm}km`,
        "start_date.range_start": now.toISOString(),
        "start_date.range_end": endTime.toISOString(),
        expand: "venue,ticket_availability,category",
        page_size: EVENTBRITE_PAGE_SIZE,
        page
      },
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      diagnostics.push(
        diagnostic({
          source: "eventbrite_official",
          status: response.status === 404 ? "unavailable" : "failed",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message:
            response.status === 404
              ? "Eventbrite public search is not available for this token/API version"
              : "Eventbrite public search returned a non-success status",
          details: { statusCode: response.status, statusText: response.statusText, page }
        })
      );
      break;
    }

    const pageEvents: Array<Record<string, unknown>> = Array.isArray(response.data?.events)
      ? response.data.events
      : [];
    allRawEvents.push(...pageEvents);

    const pagination = response.data?.pagination as Record<string, unknown> | undefined;
    const hasMore = Boolean(pagination?.has_more_items);
    if (!hasMore || pageEvents.length === 0) {
      break;
    }
  }

  const eventsInsideRadius = allRawEvents.filter((event) => {
    const coordinates = rawEventCoordinates(event);
    return (
      coordinates !== null &&
      distanceMeters(input.lat, input.lng, coordinates.lat, coordinates.lng) <= input.radiusMeters
    );
  });
  const events = eventsInsideRadius
    .map((event) => normaliseEventbriteEvent(event))
    .filter((event): event is EventInput => Boolean(event));

  diagnostics.push(
    diagnostic({
      source: "eventbrite_official",
      status: "ok",
      found: allRawEvents.length,
      normalised: events.length,
      rejected: allRawEvents.length - events.length,
      geocoded: 0,
      message: "Eventbrite public search completed"
    })
  );

  return { events, diagnostics };
}

function flattenJsonLd(node: unknown): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => flattenJsonLd(item));
  }

  const record = asRecord(node);
  if (!record) {
    return [];
  }

  const graph = Array.isArray(record["@graph"]) ? flattenJsonLd(record["@graph"]) : [];
  const itemList = Array.isArray(record.itemListElement)
    ? flattenJsonLd(
        record.itemListElement.map((item) => {
          const itemRecord = asRecord(item);
          return itemRecord?.item ?? item;
        })
      )
    : [];

  return [record, ...graph, ...itemList];
}

function extractJsonLdEvents(html: string) {
  const matches = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  const events: Record<string, unknown>[] = [];

  for (const match of matches) {
    const content = match[1];
    if (!content) {
      continue;
    }

    try {
      const parsed = JSON.parse(content.trim());
      const flattened = flattenJsonLd(parsed);
      events.push(
        ...flattened.filter((item) => {
          const type = item["@type"];
          return Array.isArray(type) ? type.includes("Event") : type === "Event";
        })
      );
    } catch {
      // Ignore malformed JSON-LD blocks. Eventbrite can embed tracking scripts nearby.
    }
  }

  return events;
}

function jsonLdAddressString(location: Record<string, unknown> | null) {
  const address = location ? location.address : null;
  const addressRecord = asRecord(address);
  if (typeof address === "string" && address.trim()) {
    return address.trim();
  }

  if (!addressRecord) {
    return null;
  }

  const parts = [
    addressRecord.streetAddress,
    addressRecord.addressLocality,
    addressRecord.addressRegion,
    addressRecord.postalCode,
    addressRecord.addressCountry
  ]
    .map(asString)
    .filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

function jsonLdCoordinates(location: Record<string, unknown> | null) {
  const geo = asRecord(location?.geo);
  if (!geo) {
    return null;
  }

  const lat = toNumber(geo.latitude);
  const lng = toNumber(geo.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return { lat, lng };
}

function estimateEndTime(startTime: Date, eventName: string, category: string | null) {
  const text = `${eventName} ${category ?? ""}`.toLowerCase();
  const durationHours =
    /festival|conference|expo|summit/.test(text) ? 6 : /party|club|nightlife/.test(text) ? 5 : 3;
  return new Date(startTime.getTime() + durationHours * 60 * 60 * 1000);
}

function estimateAttendance(eventName: string, category: string | null) {
  const text = `${eventName} ${category ?? ""}`.toLowerCase();
  if (/festival|stadium|arena|concert|football|match/.test(text)) return 1500;
  if (/conference|summit|expo|trade/.test(text)) return 800;
  if (/party|club|nightlife|brunch/.test(text)) return 600;
  if (/workshop|meetup|class|seminar/.test(text)) return 150;
  return 500;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = asString(value);
    if (text) return text;
  }
  return null;
}

function asRecordArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function addressRecordToString(value: unknown) {
  const record = asRecord(value);
  if (!record) return null;
  const parts = [
    record.street_address,
    record.streetAddress,
    record.address,
    record.locality,
    record.city,
    record.region,
    record.postcode,
    record.postalCode,
    record.country
  ]
    .map(asString)
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? Array.from(new Set(parts)).join(", ") : null;
}

function derivePredictHqVenue(raw: Record<string, unknown>) {
  const entities = asRecordArray(raw.entities);
  const venueEntity =
    entities.find((entity) => {
      const type = firstNonEmpty(entity.type, entity.category);
      return type
        ? /venue|place|location/i.test(type)
        : Boolean(firstNonEmpty(entity.name, entity.label) && firstNonEmpty(entity.formatted_address, entity.address));
    }) ?? null;

  const address = firstNonEmpty(
    venueEntity?.formatted_address,
    venueEntity?.formattedAddress,
    addressRecordToString(venueEntity?.address),
    raw.formatted_address,
    raw.formattedAddress,
    addressRecordToString(raw.address)
  );
  const venueName = firstNonEmpty(
    venueEntity?.name,
    venueEntity?.label,
    venueEntity?.title,
    raw.venue_name,
    raw.venue,
    address?.split(",")[0]
  );

  return { venueName, address };
}

async function normaliseJsonLdEvent(
  raw: Record<string, unknown>,
  input: EventSourceFetchInput,
  context: MarketSearchContext
): Promise<{ event: EventInput | null; geocoded: boolean; rejectedReason?: string }> {
  const name = asString(raw.name);
  const startDate = asString(raw.startDate);
  if (!name || !startDate) {
    return { event: null, geocoded: false, rejectedReason: "missing_name_or_start_date" };
  }

  const startTime = new Date(startDate);
  if (Number.isNaN(startTime.getTime())) {
    return { event: null, geocoded: false, rejectedReason: "invalid_start_date" };
  }

  const location = asRecord(raw.location);
  const venueName = asString(location?.name);
  const url = asString(raw.url);
  const category = asString(raw.eventAttendanceMode) ?? asString(raw.category);
  const address = jsonLdAddressString(location);
  let coordinates = jsonLdCoordinates(location);
  let geocoded = false;
  let geocodedMarket: { city: string | null; country: string | null; formattedAddress: string | null } = {
    city: null,
    country: null,
    formattedAddress: null
  };

  if (!coordinates && address) {
    const result = await geocodeAddress(address);
    if (result) {
      coordinates = { lat: result.lat, lng: result.lng };
      geocoded = true;
      geocodedMarket = {
        city: result.city,
        country: result.country,
        formattedAddress: result.formattedAddress
      };
    }
  }

  if (!coordinates) {
    return { event: null, geocoded, rejectedReason: "missing_coordinates" };
  }

  if (distanceMeters(input.lat, input.lng, coordinates.lat, coordinates.lng) > input.radiusMeters) {
    return { event: null, geocoded, rejectedReason: "outside_radius" };
  }

  const rawEndDate = asString(raw.endDate);
  const parsedEndTime = rawEndDate ? new Date(rawEndDate) : null;
  const endTime =
    parsedEndTime && !Number.isNaN(parsedEndTime.getTime())
      ? parsedEndTime
      : estimateEndTime(startTime, name, category);
  const eventUrl = url ?? `${name}:${startDate}:${address ?? venueName ?? ""}`;
  const storedAddress = geocodedMarket.formattedAddress ?? address;
  const storedVenueName = venueName ?? storedAddress?.split(",")[0]?.trim() ?? null;
  if (!storedVenueName && !storedAddress) {
    return { event: null, geocoded, rejectedReason: "missing_venue" };
  }

  return {
    geocoded,
    event: {
      externalId: `eventbrite-public:${stableHash(eventUrl)}`,
      source: "eventbrite",
      name,
      venueName: storedVenueName,
      lat: coordinates.lat,
      lng: coordinates.lng,
      address: storedAddress,
      city: geocodedMarket.city ?? context.city,
      country: canonicalMarketCountry(geocodedMarket.country ?? context.country) ?? context.country,
      startTime,
      endTime,
      expectedAttendance: estimateAttendance(name, category),
      eventType: "Public Event",
      eventCategory: category,
      rawData: {
        ...raw,
        sourceUrl: eventUrl,
        ingestionSource: "eventbrite_public_scraper"
      }
    }
  };
}

async function fetchEventbritePublicPageEventsNear(
  input: EventSourceFetchInput
): Promise<EventSourceResult> {
  if (!env.EVENTBRITE_PUBLIC_SCRAPER_ENABLED) {
    return {
      events: [],
      diagnostics: [
        diagnostic({
          source: "eventbrite_scraper",
          status: "disabled",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: "EVENTBRITE_PUBLIC_SCRAPER_ENABLED is false"
        })
      ]
    };
  }

  const context = await resolveMarket(input);
  const citySlug = slugify(context.city);
  const countrySlug = context.eventbriteCountrySlug;
  const base = `https://www.eventbrite.com/d/${countrySlug}--${citySlug}`;
  const urls = [
    `${base}/events/`,
    `${base}/all-events/`,
    `${base}/music/`,
    `${base}/business/`,
    `${base}/nightlife/`,
    `${base}/food-and-drink/`,
    `${base}/performing-arts/`,
    `${base}/sports/`
  ];
  const diagnostics: EventSourceDiagnostic[] = [];
  const rawEventsByKey = new Map<string, Record<string, unknown>>();
  let blockedOrFailed = false;

  for (const url of urls) {
    const response = await axios.get(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": env.EVENTBRITE_SCRAPER_USER_AGENT
      },
      timeout: 20000,
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300 || typeof response.data !== "string") {
      blockedOrFailed = true;
      diagnostics.push(
        diagnostic({
          source: "eventbrite_scraper",
          status: response.status === 403 || response.status === 429 ? "unavailable" : "failed",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: "Eventbrite public page fetch returned a non-success status",
          details: { url, statusCode: response.status }
        })
      );
      continue;
    }

    const pageEvents = extractJsonLdEvents(response.data);
    for (const event of pageEvents) {
      const key = asString(event.url) ?? `${asString(event.name) ?? "event"}:${asString(event.startDate) ?? ""}`;
      rawEventsByKey.set(key, event);
    }
  }

  const rawEvents = Array.from(rawEventsByKey.values());
  const normalised = await Promise.all(
    rawEvents.map((event) => normaliseJsonLdEvent(event, input, context))
  );
  const events = normalised
    .map((result) => result.event)
    .filter((event): event is EventInput => Boolean(event));
  const geocoded = normalised.filter((result) => result.geocoded).length;
  const rejected = rawEvents.length - events.length;

  diagnostics.push(
    diagnostic({
      source: "eventbrite_scraper",
      status: rawEvents.length > 0 || !blockedOrFailed ? "ok" : "unavailable",
      found: rawEvents.length,
      normalised: events.length,
      rejected,
      geocoded,
      message:
        events.length > 0
          ? "Eventbrite public page extraction completed"
          : "Eventbrite public pages were reachable but produced no geocoded events inside the radius",
      details: {
        city: context.city,
        country: context.country,
        urls
      }
    })
  );

  return { events, diagnostics };
}

async function fetchAggregatorEventsNear(input: EventSourceFetchInput): Promise<EventSourceResult> {
  const provider = env.EVENT_AGGREGATOR_PROVIDER.trim().toLowerCase();
  if (!provider || !env.EVENT_AGGREGATOR_API_KEY) {
    return {
      events: [],
      diagnostics: [
        diagnostic({
          source: "event_aggregator",
          status: "disabled",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: "EVENT_AGGREGATOR_PROVIDER or EVENT_AGGREGATOR_API_KEY is not configured"
        })
      ]
    };
  }

  if (provider !== "predicthq") {
    return {
      events: [],
      diagnostics: [
        diagnostic({
          source: "event_aggregator",
          status: "unavailable",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: `Unsupported event aggregator provider: ${provider}`
        })
      ]
    };
  }

  const market = await resolveMarket(input);
  const response = await axios.get("https://api.predicthq.com/v1/events/", {
    headers: {
      Authorization: `Bearer ${env.EVENT_AGGREGATOR_API_KEY}`,
      Accept: "application/json"
    },
    params: {
      within: `${input.radiusMeters}m@${input.lat},${input.lng}`,
      "active.gte": (input.startTime ?? new Date()).toISOString(),
      "active.lte": (input.endTime ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).toISOString(),
      limit: 100
    },
    timeout: 20000,
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    return {
      events: [],
      diagnostics: [
        diagnostic({
          source: "event_aggregator",
          status: "failed",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: "Event aggregator returned a non-success status",
          details: { provider, statusCode: response.status }
        })
      ]
    };
  }

  const rawEvents: Array<Record<string, unknown>> = Array.isArray(response.data?.results)
    ? response.data.results
    : [];
  const events = rawEvents
    .map<EventInput | null>((raw) => {
      const location = Array.isArray(raw.location) ? raw.location : [];
      const lng = toNumber(location[0]);
      const lat = toNumber(location[1]);
      const title = asString(raw.title);
      const start = asString(raw.start);
      if (!title || !start || Number.isNaN(lat) || Number.isNaN(lng)) {
        return null;
      }

      const startTime = new Date(start);
      if (Number.isNaN(startTime.getTime())) {
        return null;
      }

      const { venueName, address } = derivePredictHqVenue(raw);
      if (!venueName && !address) {
        return null;
      }

      const endRaw = asString(raw.end);
      const parsedEndTime = endRaw ? new Date(endRaw) : null;
      const endTime =
        parsedEndTime && !Number.isNaN(parsedEndTime.getTime())
          ? parsedEndTime
          : estimateEndTime(startTime, title, asString(raw.category));

      const event: EventInput = {
        externalId: `aggregator:${provider}:${asString(raw.id) ?? stableHash(`${title}:${start}`)}`,
        source: "event_aggregator",
        name: title,
        venueName: venueName ?? address,
        lat,
        lng,
        address,
        city: market.city,
        country: market.country,
        startTime,
        endTime,
        expectedAttendance: typeof raw.rank === "number" ? Math.max(100, Number(raw.rank) * 20) : null,
        eventType: "Public Event",
        eventCategory: asString(raw.category),
        rawData: {
          ...raw,
          ingestionSource: `event_aggregator:${provider}`
        }
      };

      return event;
    })
    .filter((event): event is EventInput => event !== null);

  return {
    events,
    diagnostics: [
      diagnostic({
        source: "event_aggregator",
        status: "ok",
        found: rawEvents.length,
        normalised: events.length,
        rejected: rawEvents.length - events.length,
        geocoded: 0,
        message: "Event aggregator fetch completed",
        details: { provider }
      })
    ]
  };
}

export async function fetchPublicEventbriteEventsNear(
  input: EventSourceFetchInput
): Promise<EventSourceResult> {
  const results = await Promise.allSettled([
    fetchEventbriteOfficialDiscoveryNear(input),
    fetchEventbritePublicPageEventsNear(input),
    fetchAggregatorEventsNear(input)
  ]);

  const events: EventInput[] = [];
  const diagnostics: EventSourceDiagnostic[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      events.push(...result.value.events);
      diagnostics.push(...result.value.diagnostics);
    } else {
      diagnostics.push(
        diagnostic({
          source: "eventbrite_public",
          status: "failed",
          found: 0,
          normalised: 0,
          rejected: 0,
          geocoded: 0,
          message: result.reason instanceof Error ? result.reason.message : String(result.reason)
        })
      );
    }
  }

  const uniqueEvents = Array.from(
    new Map(events.map((event) => [`${event.source}:${event.externalId}`, event])).values()
  );

  console.info(
    JSON.stringify({
      event: "eventbrite_public_discovery_completed",
      events: uniqueEvents.length,
      diagnostics
    })
  );

  return {
    events: uniqueEvents,
    diagnostics
  };
}

export async function fetchEventbriteEventsNear(input: EventSourceFetchInput) {
  return (await fetchPublicEventbriteEventsNear(input)).events;
}

export async function fetchEventbriteEvents(city: string) {
  const market = SUPPORTED_MARKETS.find(
    (item) => item.city.toLowerCase() === city.trim().toLowerCase()
  );
  if (!market) {
    console.warn(
      JSON.stringify({
        event: "eventbrite_city_not_supported",
        city,
        message: "Fixed-city Eventbrite ingestion only supports configured RideSpot launch markets."
      })
    );
    return [] as EventInput[];
  }

  return (
    await fetchPublicEventbriteEventsNear({
      lat: market.lat,
      lng: market.lng,
      radiusMeters: 15000,
      city: market.city,
      country: market.country
    })
  ).events;
}
