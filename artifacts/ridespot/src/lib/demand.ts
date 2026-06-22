import type { DemandLevel, DemandVisual } from "@/types";
import {
  AUTHENTICATED_HOTSPOT_FILTERS,
  DEMAND_COLORS,
  getDemandBorderColor
} from "@/lib/demandColors";

export const DEMAND_VISUALS: Record<DemandLevel, DemandVisual> = {
  "very-high": {
    label: DEMAND_COLORS["very-high"].label,
    shortLabel: "SURGE",
    pinColor: DEMAND_COLORS["very-high"].pin,
    backgroundColor: DEMAND_COLORS["very-high"].badge,
    borderColor: getDemandBorderColor("very-high"),
    textColor: DEMAND_COLORS["very-high"].text
  },
  high: {
    label: DEMAND_COLORS.high.label,
    shortLabel: "HIGH",
    pinColor: DEMAND_COLORS.high.pin,
    backgroundColor: DEMAND_COLORS.high.badge,
    borderColor: getDemandBorderColor("high"),
    textColor: DEMAND_COLORS.high.text
  },
  medium: {
    label: DEMAND_COLORS.medium.label,
    shortLabel: "MED",
    pinColor: DEMAND_COLORS.medium.pin,
    backgroundColor: DEMAND_COLORS.medium.badge,
    borderColor: getDemandBorderColor("medium"),
    textColor: DEMAND_COLORS.medium.text
  },
  low: {
    label: DEMAND_COLORS.low.label,
    shortLabel: "LOW",
    pinColor: DEMAND_COLORS.low.pin,
    backgroundColor: DEMAND_COLORS.low.badge,
    borderColor: getDemandBorderColor("low"),
    textColor: DEMAND_COLORS.low.text
  }
};

export const HOTSPOT_FILTERS = AUTHENTICATED_HOTSPOT_FILTERS;

export function getDemandVisual(level: DemandLevel): DemandVisual {
  return DEMAND_VISUALS[level];
}
