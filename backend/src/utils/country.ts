import { AppError } from "./http.js";

export type MarketCountry = "Nigeria" | "UK";

export const MARKET_COUNTRIES: readonly MarketCountry[] = ["Nigeria", "UK"];

export function canonicalMarketCountry(country: string | null | undefined) {
  if (!country) {
    return country ?? null;
  }

  const trimmed = country.trim();
  const normalized = trimmed.toLowerCase();

  if (["uk", "gb", "gbr", "united kingdom", "great britain", "britain"].includes(normalized)) {
    return "UK";
  }

  if (["ng", "nga", "nigeria"].includes(normalized)) {
    return "Nigeria";
  }

  return trimmed;
}

export function assertMarketCountry(country: string | null | undefined): MarketCountry {
  const canonical = canonicalMarketCountry(country);
  if (canonical === "Nigeria" || canonical === "UK") {
    return canonical;
  }

  throw new AppError(400, "VALIDATION_ERROR", "Country must be Nigeria or UK");
}
