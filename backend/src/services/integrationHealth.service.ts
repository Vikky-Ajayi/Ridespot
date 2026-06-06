import axios from "axios";
import { env } from "../config/env.js";

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
      timeout: 15000,
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
      timeout: 15000,
      validateStatus: () => true
    });

    const organizations = Array.isArray(orgResponse.data?.organizations)
      ? orgResponse.data.organizations
      : [];
    const organizationCount = organizations.length;
    const organizationId =
      organizations[0]?.id && typeof organizations[0].id === "string"
        ? organizations[0].id
        : null;

    if (!organizationId) {
      return status({
        name: "eventbrite",
        configured: true,
        reachable: orgResponse.status >= 200 && orgResponse.status < 300,
        canIngest: false,
        statusCode: orgResponse.status,
        message: "Eventbrite API is reachable, but this token has no organizations to ingest events from",
        details: { organizationCount, eventCount: 0, eventsWithVenueCoordinates: 0 }
      });
    }

    const eventsResponse = await axios.get(
      `https://www.eventbriteapi.com/v3/organizations/${organizationId}/events/`,
      {
        headers,
        params: {
          time_filter: "current_future",
          page_size: 5
        },
        timeout: 20000,
        validateStatus: () => true
      }
    );

    const events = Array.isArray(eventsResponse.data?.events) ? eventsResponse.data.events : [];
    const venueIds: string[] = events
      .map((event: Record<string, unknown>) => event.venue_id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
    const venueResults = await Promise.allSettled(
      venueIds.map((venueId) =>
        axios.get(`https://www.eventbriteapi.com/v3/venues/${venueId}/`, {
          headers,
          timeout: 10000,
          validateStatus: () => true
        })
      )
    );
    const eventsWithVenueCoordinates = venueResults.filter((result) => {
      if (result.status !== "fulfilled" || result.value.status < 200 || result.value.status >= 300) {
        return false;
      }

      const venue = result.value.data;
      return Boolean(venue?.latitude && venue?.longitude);
    }).length;

    return status({
      name: "eventbrite",
      configured: true,
      reachable: eventsResponse.status >= 200 && eventsResponse.status < 300,
      canIngest: eventsWithVenueCoordinates > 0,
      statusCode: eventsResponse.status,
      message:
        eventsWithVenueCoordinates > 0
          ? "Eventbrite API is reachable and future events with venue coordinates are available"
          : "Eventbrite API is reachable, but no future sampled events have venue coordinates for hotspot generation",
      details: { organizationCount, eventCount: events.length, eventsWithVenueCoordinates }
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
