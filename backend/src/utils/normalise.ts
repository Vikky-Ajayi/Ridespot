import { canonicalMarketCountry } from "./country.js";

export interface EventInput {
  externalId: string;
  source: "ticketmaster" | "eventbrite" | "event_aggregator" | "google_places" | "manual" | "restaurant_cluster";
  name: string;
  venueName: string | null;
  lat: number;
  lng: number;
  address: string | null;
  city: string;
  country: string;
  startTime: Date;
  endTime: Date | null;
  expectedAttendance: number | null;
  eventType: string | null;
  eventCategory: string | null;
  sourceUrl?: string | null;
  estimatedEndTime?: boolean;
  rawData: object;
}

function toNumber(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return Number(value);
  }

  return Number.NaN;
}

export function normaliseTicketmasterEvent(raw: Record<string, unknown>): EventInput | null {
  const embedded = (raw._embedded as Record<string, unknown> | undefined) ?? {};
  const venues = (embedded.venues as Array<Record<string, unknown>> | undefined) ?? [];
  const venue = venues[0];
  const location = (venue?.location as Record<string, unknown> | undefined) ?? {};
  const longitude = toNumber(location.longitude);
  const latitude = toNumber(location.latitude);

  if (!venue || Number.isNaN(longitude) || Number.isNaN(latitude) || !raw.id || !raw.name) {
    return null;
  }

  const address = (venue.address as Record<string, unknown> | undefined) ?? {};
  const city = (venue.city as Record<string, unknown> | undefined) ?? {};
  const country = (venue.country as Record<string, unknown> | undefined) ?? {};
  const dates = (raw.dates as Record<string, unknown> | undefined) ?? {};
  const start = (dates.start as Record<string, unknown> | undefined) ?? {};
  const end = (dates.end as Record<string, unknown> | undefined) ?? {};
  const classifications =
    (raw.classifications as Array<Record<string, unknown>> | undefined) ?? [];

  return {
    externalId: String(raw.id),
    source: "ticketmaster",
    name: String(raw.name),
    venueName: venue.name ? String(venue.name) : null,
    lat: latitude,
    lng: longitude,
    address: address.line1 ? String(address.line1) : null,
    city: city.name ? String(city.name) : "Unknown",
    country: canonicalMarketCountry(country.countryCode ? String(country.countryCode) : "Unknown") ?? "Unknown",
    startTime: new Date(String(start.dateTime ?? raw.dates)),
    endTime: end.dateTime ? new Date(String(end.dateTime)) : null,
    expectedAttendance:
      typeof (venue.upcomingEvents as Record<string, unknown> | undefined)?._total === "number"
        ? Number((venue.upcomingEvents as Record<string, unknown>)._total)
        : null,
    eventType: null,
    eventCategory: classifications[0]?.segment ? String((classifications[0].segment as Record<string, unknown>).name ?? "") : null,
    sourceUrl: typeof raw.url === "string" ? raw.url : null,
    estimatedEndTime: false,
    rawData: raw
  };
}

export function normaliseEventbriteEvent(raw: Record<string, unknown>): EventInput | null {
  const venue = (raw.venue as Record<string, unknown> | undefined) ?? {};
  const address = (venue.address as Record<string, unknown> | undefined) ?? {};
  const longitude = toNumber(venue.longitude);
  const latitude = toNumber(venue.latitude);
  const name = (raw.name as Record<string, unknown> | undefined) ?? {};
  const start = (raw.start as Record<string, unknown> | undefined) ?? {};
  const end = (raw.end as Record<string, unknown> | undefined) ?? {};
  const ticketAvailability =
    (raw.ticket_availability as Record<string, unknown> | undefined) ?? {};
  const category = (raw.category as Record<string, unknown> | undefined) ?? {};

  if (!raw.id || Number.isNaN(longitude) || Number.isNaN(latitude) || !name.text) {
    return null;
  }

  return {
    externalId: String(raw.id),
    source: "eventbrite",
    name: String(name.text),
    venueName: venue.name ? String(venue.name) : null,
    lat: latitude,
    lng: longitude,
    address: address.localized_address_display
      ? String(address.localized_address_display)
      : null,
    city: address.city ? String(address.city) : "Unknown",
    country: canonicalMarketCountry(address.country ? String(address.country) : "Unknown") ?? "Unknown",
    startTime: new Date(String(start.utc)),
    endTime: end.utc ? new Date(String(end.utc)) : null,
    expectedAttendance:
      typeof ticketAvailability.maximum_ticket_price === "number"
        ? Number(ticketAvailability.maximum_ticket_price)
        : null,
    eventType: null,
    eventCategory: category.name ? String(category.name) : null,
    sourceUrl: typeof raw.url === "string" ? raw.url : null,
    estimatedEndTime: false,
    rawData: raw
  };
}
