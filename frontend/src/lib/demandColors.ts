export const DEMAND_COLORS = {
  "very-high": {
    pin: "#EF4444",
    badge: "#FEE2E2",
    text: "#EF4444",
    label: "Very High",
    statusText: "↗ Surge demand active"
  },
  high: {
    pin: "#EF4444",
    badge: "#FEE2E2",
    text: "#EF4444",
    label: "High Demand",
    statusText: "↗ Demand expected to Increase"
  },
  medium: {
    pin: "#F97316",
    badge: "#FFF7ED",
    text: "#F97316",
    label: "Medium Demand",
    statusText: "↗ Demand increase likely"
  },
  low: {
    pin: "#00D46A",
    badge: "#DCFCE7",
    text: "#00D46A",
    label: "Low Demand",
    statusText: "↗ Low Demand predicted"
  }
} as const;

export type DemandLevel = keyof typeof DEMAND_COLORS;

const DEMAND_BORDER_COLORS: Record<DemandLevel, string> = {
  "very-high": "#FECACA",
  high: "#FECACA",
  medium: "#FED7AA",
  low: "#BBF7D0"
};

export const AUTHENTICATED_HOTSPOT_FILTERS: Array<{
  label: string;
  value: "all" | Exclude<DemandLevel, "very-high">;
}> = [
  { label: "All", value: "all" },
  { label: "High Demand", value: "high" },
  { label: "Medium Demand", value: "medium" },
  { label: "Low Demand", value: "low" }
];

export function getDemandColor(level: DemandLevel) {
  return DEMAND_COLORS[level];
}

export function getDemandBorderColor(level: DemandLevel) {
  return DEMAND_BORDER_COLORS[level];
}
