export type MarketCountry = "Nigeria" | "UK";

export const MARKET_COUNTRIES: Array<{ label: string; value: MarketCountry; phoneCountry: "ng" | "gb" }> = [
  { label: "Nigeria", value: "Nigeria", phoneCountry: "ng" },
  { label: "UK", value: "UK", phoneCountry: "gb" }
];

export const COUNTRY_SELECT_OPTIONS = [
  { label: "Select Country", value: "" },
  ...MARKET_COUNTRIES.map((country) => ({
    label: country.label,
    value: country.value
  }))
];

export function normaliseMarketCountry(value: string | null | undefined): MarketCountry | "" {
  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (["uk", "gb", "gbr", "united kingdom", "great britain", "britain"].includes(normalized)) {
    return "UK";
  }

  if (["ng", "nga", "nigeria"].includes(normalized)) {
    return "Nigeria";
  }

  return "";
}

export function countryFromPhoneCountry(value: "ng" | "gb"): MarketCountry {
  return value === "gb" ? "UK" : "Nigeria";
}

export function phoneCountryFromMarket(value: string | null | undefined): "ng" | "gb" {
  return normaliseMarketCountry(value) === "UK" ? "gb" : "ng";
}
