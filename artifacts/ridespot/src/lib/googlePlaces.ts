"use client";

import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

let loaderPromise: Promise<void> | null = null;

declare global {
  interface Window {
    __ridespotGoogleMapsAuthFailed?: boolean;
    gm_authFailure?: () => void;
  }
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
  location?: {
    lat: number;
    lng: number;
  };
  source?: "google" | "local" | "osm";
}

export interface SelectedPlace {
  placeId: string;
  name: string;
  address: string;
  location: {
    lat: number;
    lng: number;
  } | null;
}

export function loadGooglePlaces(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Places is only available in the browser."));
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not configured."));
  }

  window.gm_authFailure = () => {
    window.__ridespotGoogleMapsAuthFailed = true;
    window.dispatchEvent(new Event("ridespot:google-maps-auth-failure"));
  };

  if (!loaderPromise) {
    setOptions({ key: apiKey, v: "weekly" });
    loaderPromise = importLibrary("places").then(() => undefined);
  }

  return loaderPromise;
}

export function mapPrediction(prediction: google.maps.places.AutocompletePrediction): PlaceSuggestion {
  return {
    placeId: prediction.place_id,
    description: prediction.description,
    mainText: prediction.structured_formatting.main_text,
    secondaryText: prediction.structured_formatting.secondary_text ?? "",
    source: "google"
  };
}

const LOCAL_PLACE_INDEX: PlaceSuggestion[] = [
  {
    placeId: "local:lagos",
    description: "Lagos, Nigeria",
    mainText: "Lagos",
    secondaryText: "Nigeria",
    location: { lat: 6.5244, lng: 3.3792 },
    source: "local"
  },
  {
    placeId: "local:victoria-island",
    description: "Victoria Island, Lagos, Nigeria",
    mainText: "Victoria Island",
    secondaryText: "Lagos, Nigeria",
    location: { lat: 6.4281, lng: 3.4219 },
    source: "local"
  },
  {
    placeId: "local:lekki",
    description: "Lekki, Lagos, Nigeria",
    mainText: "Lekki",
    secondaryText: "Lagos, Nigeria",
    location: { lat: 6.4698, lng: 3.5852 },
    source: "local"
  },
  {
    placeId: "local:ikeja",
    description: "Ikeja, Lagos, Nigeria",
    mainText: "Ikeja",
    secondaryText: "Lagos, Nigeria",
    location: { lat: 6.6018, lng: 3.3515 },
    source: "local"
  },
  {
    placeId: "local:abuja",
    description: "Abuja, Nigeria",
    mainText: "Abuja",
    secondaryText: "Nigeria",
    location: { lat: 9.0765, lng: 7.3986 },
    source: "local"
  },
  {
    placeId: "local:london",
    description: "London, UK",
    mainText: "London",
    secondaryText: "UK",
    location: { lat: 51.5074, lng: -0.1278 },
    source: "local"
  },
  {
    placeId: "local:wembley",
    description: "Wembley, London, UK",
    mainText: "Wembley",
    secondaryText: "London, UK",
    location: { lat: 51.556, lng: -0.2796 },
    source: "local"
  },
  {
    placeId: "local:o2-arena",
    description: "The O2 Arena, London, UK",
    mainText: "The O2 Arena",
    secondaryText: "London, UK",
    location: { lat: 51.503, lng: 0.0032 },
    source: "local"
  },
  {
    placeId: "local:manchester",
    description: "Manchester, UK",
    mainText: "Manchester",
    secondaryText: "UK",
    location: { lat: 53.4808, lng: -2.2426 },
    source: "local"
  },
  {
    placeId: "local:birmingham",
    description: "Birmingham, UK",
    mainText: "Birmingham",
    secondaryText: "UK",
    location: { lat: 52.4862, lng: -1.8904 },
    source: "local"
  }
];

export function marketPlaceSuggestions(query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  return LOCAL_PLACE_INDEX.filter((place) =>
    `${place.mainText} ${place.secondaryText} ${place.description}`.toLowerCase().includes(normalizedQuery)
  ).slice(0, 5);
}

interface NominatimResult {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
}

export async function fallbackPlaceSuggestions(query: string): Promise<PlaceSuggestion[]> {
  const localMatches = marketPlaceSuggestions(query);
  if (localMatches.length) {
    return localMatches;
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ng,gb&q=${encodeURIComponent(query)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(2500)
      }
    );

    if (!response.ok) {
      return localMatches;
    }

    const results = (await response.json()) as NominatimResult[];
    const remoteMatches = results
      .map((result): PlaceSuggestion | null => {
        const lat = Number(result.lat);
        const lng = Number(result.lon);
        const description = result.display_name ?? result.name ?? "";

        if (!description || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return null;
        }

        const [mainText, ...rest] = description.split(",").map((part) => part.trim());
        return {
          placeId: `osm:${result.place_id ?? `${lat},${lng}`}`,
          description,
          mainText: mainText || description,
          secondaryText: rest.slice(0, 3).join(", "),
          location: { lat, lng },
          source: "osm"
        };
      })
      .filter((result): result is PlaceSuggestion => Boolean(result));

    const seen = new Set<string>();
    return [...localMatches, ...remoteMatches]
      .filter((place) => {
        const key = place.description.toLowerCase();
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  } catch {
    return localMatches;
  }
}

export async function getPlaceDetails(placeId: string): Promise<SelectedPlace> {
  await loadGooglePlaces();

  return new Promise((resolve, reject) => {
    const container = document.createElement("div");
    const service = new google.maps.places.PlacesService(container);

    service.getDetails(
      {
        placeId,
        fields: ["place_id", "name", "formatted_address", "geometry"]
      },
      (place, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
          reject(new Error(`Google Places details failed: ${status}`));
          return;
        }

        const location = place.geometry?.location;
        resolve({
          placeId: place.place_id ?? placeId,
          name: place.name ?? place.formatted_address ?? "Selected place",
          address: place.formatted_address ?? "",
          location: location
            ? {
                lat: location.lat(),
                lng: location.lng()
              }
            : null
        });
      }
    );
  });
}
