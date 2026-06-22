import axios from "axios";
import { env } from "../config/env.js";
import { fetchPublicEventbriteEventsNear } from "./eventbrite.service.js";

type IntegrationName =
  | "hereMaps"
  | "ticketmaster"
  | "eventbrite"
  | "googlePlacesAutocomplete"
  | "googlePlacesNearby"
  | "googleRoutes";

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
      timeout: 15000,
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
      timeout: 15000,
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

export async function checkGooglePlacesAutocomplete(): Promise<IntegrationStatus> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return status({
      name: "googlePlacesAutocomplete",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "GOOGLE_MAPS_API_KEY is missing"
    });
  }

  try {
    const response = await axios.get(
      "https://maps.googleapis.com/maps/api/place/autocomplete/json",
      {
        params: {
          input: "Lagos event centre",
          components: "country:ng",
          key: env.GOOGLE_MAPS_API_KEY
        },
        timeout: 15000,
        validateStatus: () => true
      }
    );

    const predictionCount = Array.isArray(response.data?.predictions)
      ? response.data.predictions.length
      : 0;
    const googleStatus = response.data?.status ?? null;
    const ok = response.status >= 200 && response.status < 300 && googleStatus === "OK";

    return status({
      name: "googlePlacesAutocomplete",
      configured: true,
      reachable: response.status >= 200 && response.status < 300,
      canIngest: ok && predictionCount > 0,
      statusCode: response.status,
      message:
        ok && predictionCount > 0
          ? "Google Places Autocomplete is reachable and returning predictions"
          : "Google Places Autocomplete did not return usable predictions",
      details: {
        googleStatus,
        predictionCount,
        errorMessage: response.data?.error_message ?? null
      }
    });
  } catch (error) {
    return status({
      name: "googlePlacesAutocomplete",
      configured: true,
      reachable: false,
      canIngest: false,
      statusCode: axios.isAxiosError(error) ? error.response?.status ?? null : null,
      message: errorMessage(error)
    });
  }
}

export async function checkGooglePlacesNearby(): Promise<IntegrationStatus> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return status({
      name: "googlePlacesNearby",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "GOOGLE_MAPS_API_KEY is missing"
    });
  }

  try {
    const response = await axios.get("https://maps.googleapis.com/maps/api/place/nearbysearch/json", {
      params: {
        location: "51.556,-0.2796",
        radius: 300,
        type: "point_of_interest",
        key: env.GOOGLE_MAPS_API_KEY
      },
      timeout: 15000,
      validateStatus: () => true
    });

    const resultCount = Array.isArray(response.data?.results) ? response.data.results.length : 0;
    const googleStatus = response.data?.status ?? null;
    const ok = response.status >= 200 && response.status < 300 && googleStatus === "OK";

    return status({
      name: "googlePlacesNearby",
      configured: true,
      reachable: response.status >= 200 && response.status < 300,
      canIngest: ok && resultCount > 0,
      statusCode: response.status,
      message:
        ok && resultCount > 0
          ? "Google Places Nearby Search is reachable and returning nearby places"
          : "Google Places Nearby Search did not return usable nearby places",
      details: {
        googleStatus,
        resultCount,
        errorMessage: response.data?.error_message ?? null
      }
    });
  } catch (error) {
    return status({
      name: "googlePlacesNearby",
      configured: true,
      reachable: false,
      canIngest: false,
      statusCode: axios.isAxiosError(error) ? error.response?.status ?? null : null,
      message: errorMessage(error)
    });
  }
}

export async function checkGoogleRoutes(): Promise<IntegrationStatus> {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return status({
      name: "googleRoutes",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "GOOGLE_MAPS_API_KEY is missing"
    });
  }

  try {
    const response = await axios.post(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: {
          location: {
            latLng: {
              latitude: 51.556,
              longitude: -0.2796
            }
          }
        },
        destination: {
          location: {
            latLng: {
              latitude: 51.5033,
              longitude: -0.1195
            }
          }
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: false,
        languageCode: "en",
        units: "METRIC"
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
        },
        timeout: 15000,
        validateStatus: () => true
      }
    );

    const routes = Array.isArray(response.data?.routes) ? response.data.routes : [];
    const firstRoute = routes[0] as { duration?: string; distanceMeters?: number } | undefined;
    const ok = response.status >= 200 && response.status < 300 && routes.length > 0;

    return status({
      name: "googleRoutes",
      configured: true,
      reachable: response.status >= 200 && response.status < 300,
      canIngest: ok,
      statusCode: response.status,
      message:
        ok
          ? "Google Routes API is reachable and returning driving routes"
          : "Google Routes API did not return a usable driving route",
      details: {
        routeCount: routes.length,
        distanceMeters: firstRoute?.distanceMeters ?? null,
        duration: firstRoute?.duration ?? null,
        googleStatus: response.data?.error?.status ?? null,
        errorMessage: response.data?.error?.message ?? null
      }
    });
  } catch (error) {
    return status({
      name: "googleRoutes",
      configured: true,
      reachable: false,
      canIngest: false,
      statusCode: axios.isAxiosError(error) ? error.response?.status ?? null : null,
      message: errorMessage(error)
    });
  }
}

export async function checkEventbrite(): Promise<IntegrationStatus> {
  if (!env.EVENTBRITE_API_KEY && !env.EVENTBRITE_PUBLIC_SCRAPER_ENABLED && !env.EVENT_AGGREGATOR_API_KEY) {
    return status({
      name: "eventbrite",
      configured: false,
      reachable: false,
      canIngest: false,
      statusCode: null,
      message: "No Eventbrite public discovery source is configured"
    });
  }

  try {
    const [londonResult, lagosResult] = await Promise.all([
      fetchPublicEventbriteEventsNear({
        lat: 51.5072,
        lng: -0.1276,
        radiusMeters: 15000,
        city: "London",
        country: "UK"
      }),
      fetchPublicEventbriteEventsNear({
        lat: 6.5244,
        lng: 3.3792,
        radiusMeters: 15000,
        city: "Lagos",
        country: "Nigeria"
      })
    ]);
    const eventCount = londonResult.events.length + lagosResult.events.length;
    const diagnostics = [...londonResult.diagnostics, ...lagosResult.diagnostics];
    const reachable = diagnostics.some((item) => item.status === "ok");

    return status({
      name: "eventbrite",
      configured: true,
      reachable,
      canIngest: eventCount > 0,
      statusCode: null,
      message:
        eventCount > 0
          ? "Eventbrite public discovery produced geocoded public events"
          : "Eventbrite public discovery is configured but did not produce geocoded public events",
      details: { eventCount, diagnostics }
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
  const integrations = [];
  integrations.push(await checkHereMaps());
  integrations.push(await checkGooglePlacesAutocomplete());
  integrations.push(await checkGooglePlacesNearby());
  integrations.push(await checkGoogleRoutes());
  integrations.push(await checkTicketmaster());
  integrations.push(await checkEventbrite());

  return {
    integrations,
    summary: {
      configured: integrations.filter((item) => item.configured).length,
      reachable: integrations.filter((item) => item.reachable).length,
      canIngest: integrations.filter((item) => item.canIngest).length
    }
  };
}
