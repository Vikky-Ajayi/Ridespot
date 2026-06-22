import axios from "axios";
import { env } from "../config/env.js";
import { canonicalMarketCountry } from "../utils/country.js";

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

function component(components: GoogleAddressComponent[], type: string) {
  return components.find((item) => item.types.includes(type));
}

function marketFromComponents(components: GoogleAddressComponent[]) {
  const city =
    component(components, "locality")?.long_name ??
    component(components, "postal_town")?.long_name ??
    component(components, "administrative_area_level_2")?.long_name ??
    component(components, "administrative_area_level_1")?.long_name ??
    null;
  const countryComponent = component(components, "country");
  const country =
    canonicalMarketCountry(countryComponent?.short_name ?? countryComponent?.long_name) ?? null;

  return { city, country };
}

export interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string | null;
  city: string | null;
  country: string | null;
}

export async function reverseGeocodeMarket(lat: number, lng: number) {
  if (!env.GOOGLE_MAPS_API_KEY) {
    return null;
  }

  try {
    const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        latlng: `${lat},${lng}`,
        key: env.GOOGLE_MAPS_API_KEY
      },
      timeout: 15000,
      validateStatus: () => true
    });

    const result = Array.isArray(response.data?.results) ? response.data.results[0] : null;
    if (response.status < 200 || response.status >= 300 || !result) {
      return null;
    }

    const components = Array.isArray(result.address_components)
      ? (result.address_components as GoogleAddressComponent[])
      : [];
    return marketFromComponents(components);
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "google_reverse_geocode_failed",
        message: error instanceof Error ? error.message : String(error)
      })
    );
    return null;
  }
}

export async function geocodeAddress(address: string): Promise<GeocodedLocation | null> {
  if (!env.GOOGLE_MAPS_API_KEY || !address.trim()) {
    return null;
  }

  try {
    const response = await axios.get("https://maps.googleapis.com/maps/api/geocode/json", {
      params: {
        address,
        key: env.GOOGLE_MAPS_API_KEY
      },
      timeout: 15000,
      validateStatus: () => true
    });

    const result = Array.isArray(response.data?.results) ? response.data.results[0] : null;
    const location = result?.geometry?.location;
    if (
      response.status < 200 ||
      response.status >= 300 ||
      !result ||
      typeof location?.lat !== "number" ||
      typeof location?.lng !== "number"
    ) {
      return null;
    }

    const components = Array.isArray(result.address_components)
      ? (result.address_components as GoogleAddressComponent[])
      : [];
    const market = marketFromComponents(components);

    return {
      lat: location.lat,
      lng: location.lng,
      formattedAddress:
        typeof result.formatted_address === "string" ? result.formatted_address : address,
      city: market.city,
      country: market.country
    };
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "google_geocode_failed",
        address,
        message: error instanceof Error ? error.message : String(error)
      })
    );
    return null;
  }
}
