import axios from "axios";
import { env } from "../config/env.js";

type IntegrationName = "hereMaps" | "ticketmaster" | "eventbrite";

interface IntegrationStatus {
  name: IntegrationName;
  configured: boolean;
  reachable: boolean;
  canIngest: boolean;
  statusCode: number | null;
  message: string;
  checkedAt: string;
  details?: Record<string, unknown>;
}

function status(input: Omit<IntegrationStatus, "checkedAt">): IntegrationStatus {
  return {
    ...input,
    checkedAt: new Date().toISOString()
  };
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.code === "ECONNABORTED") {
      return "Provider request timed out";
    }

    return error.response?.statusText || error.message || "Provider request failed";
  }

  return error instanceof Error ? error.message : "Provider request failed";
}

export async function checkHereMaps(): Promise<IntegrationStatus> {
  if (!env.HERE_MAPS_API_KEY) {
    return status({
      name: "hereMaps",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "HERE_MAPS_API_KEY is missing"
    });
  }

  try {
    const response = await axios.get("https://data.traffic.hereapi.com/v7/flow", {
      params: {
        apiKey: env.HERE_MAPS_API_KEY,
        in: "circle:51.556,-0.2796;r=300",
        locationReferencing: "none"
      },
      timeout: 8000,
      validateStatus: () => true
    });

    const resultCount = Array.isArray(response.data?.results) ? response.data.results.length : 0;
    const ok = response.status >= 200 && response.status < 300;

    return status({
      name: "hereMaps",
      configured: true,
      reachable: ok,
      canIngest: ok,
      statusCode: response.status,
      message: ok ? "HERE Traffic API is reachable" : "HERE Traffic API returned a non-success status",
      details: { resultCount }
    });
  } catch (error) {
    return status({
      name: "hereMaps",
      configured: true,
      reachable: false,
      canIngest: false,
      statusCode: axios.isAxiosError(error) ? error.response?.status ?? null : null,
      message: errorMessage(error)
    });
  }
}

export async function checkTicketmaster(): Promise<IntegrationStatus> {
  if (!env.TICKETMASTER_API_KEY) {
    return status({
      name: "ticketmaster",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "TICKETMASTER_API_KEY is missing"
    });
  }

  try {
    const response = await axios.get("https://app.ticketmaster.com/discovery/v2/events.json", {
      params: {
        apikey: env.TICKETMASTER_API_KEY,
        city: "London",
        countryCode: "GB",
        size: 1,
        locale: "*"
      },
      headers: {
        Accept: "application/json",
        "User-Agent": "RideSpotIntegrationHealth/1.0"
      },
      timeout: 8000,
      validateStatus: () => true
    });

    const eventCount = Array.isArray(response.data?._embedded?.events)
      ? response.data._embedded.events.length
      : 0;
    const ok = response.status >= 200 && response.status < 300;

    return status({
      name: "ticketmaster",
      configured: true,
      reachable: ok,
      canIngest: ok,
      statusCode: response.status,
      message: ok
        ? "Ticketmaster Discovery API is reachable"
        : "Ticketmaster Discovery API returned a non-success status",
      details: {
        eventCount,
        totalElements: response.data?.page?.totalElements ?? null
      }
    });
  } catch (error) {
    return status({
      name: "ticketmaster",
      configured: true,
      reachable: false,
      canIngest: false,
      statusCode: axios.isAxiosError(error) ? error.response?.status ?? null : null,
      message: errorMessage(error)
    });
  }
}

export async function checkEventbrite(): Promise<IntegrationStatus> {
  if (!env.EVENTBRITE_API_KEY) {
    return status({
      name: "eventbrite",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "EVENTBRITE_API_KEY is missing"
    });
  }

  const headers = {
    Authorization: `Bearer ${env.EVENTBRITE_API_KEY}`
  };

  try {
    const userResponse = await axios.get("https://www.eventbriteapi.com/v3/users/me/", {
      headers,
      timeout: 8000,
      validateStatus: () => true
    });

    if (userResponse.status < 200 || userResponse.status >= 300) {
      return status({
        name: "eventbrite",
        configured: true,
        reachable: false,
        canIngest: false,
        statusCode: userResponse.status,
        message: "Eventbrite token was rejected by /users/me/"
      });
    }

    const orgResponse = await axios.get("https://www.eventbriteapi.com/v3/users/me/organizations/", {
      headers,
      timeout: 8000,
      validateStatus: () => true
    });

    const organizations = Array.isArray(orgResponse.data?.organizations)
      ? orgResponse.data.organizations
      : [];
    const organizationCount = organizations.length;

    return status({
      name: "eventbrite",
      configured: true,
      reachable: orgResponse.status >= 200 && orgResponse.status < 300,
      canIngest: organizationCount > 0,
      statusCode: orgResponse.status,
      message:
        organizationCount > 0
          ? "Eventbrite API is reachable and organizations are available"
          : "Eventbrite API is reachable, but this token has no organizations to ingest events from",
      details: { organizationCount }
    });
  } catch (error) {
    return status({
      name: "eventbrite",
      configured: true,
      reachable: false,
      canIngest: false,
      statusCode: axios.isAxiosError(error) ? error.response?.status ?? null : null,
      message: errorMessage(error)
    });
  }
}

export async function getIntegrationStatuses() {
  const integrations = await Promise.all([
    checkHereMaps(),
    checkTicketmaster(),
    checkEventbrite()
  ]);

  return {
    integrations,
    summary: {
      configured: integrations.filter((item) => item.configured).length,
      reachable: integrations.filter((item) => item.reachable).length,
      canIngest: integrations.filter((item) => item.canIngest).length
    }
  };
}
