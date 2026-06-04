import type { Hotspot } from "@/types";

export type HotspotRoutingDecision = "go" | "watch" | "avoid";

export interface HotspotPolicyState {
  routingDecision: HotspotRoutingDecision;
  canNavigate: boolean;
  isCovered: boolean;
  isSuppressed: boolean;
  badgeLabel: string;
  badgeClassName: string;
  actionLabel: string;
  actionClassName: string;
  pinLabel: string;
  detailCopy: string;
}

function normaliseRoutingDecision(decision: Hotspot["routingDecision"]): HotspotRoutingDecision {
  return decision === "go" || decision === "avoid" || decision === "watch" ? decision : "watch";
}

export function getHotspotPolicyState(hotspot: Hotspot): HotspotPolicyState {
  const routingDecision = normaliseRoutingDecision(hotspot.routingDecision);
  const isCovered = hotspot.isCovered ?? false;
  const canNavigate = hotspot.canNavigate ?? (!isCovered && routingDecision === "go");
  const isSuppressed = hotspot.isSuppressed ?? (isCovered || routingDecision === "avoid");

  if (isCovered) {
    return {
      routingDecision,
      canNavigate: false,
      isCovered: true,
      isSuppressed: true,
      badgeLabel: "Covered",
      badgeClassName: "bg-[#EEF0F4] text-[#6B7280]",
      actionLabel: "Zone covered",
      actionClassName: "bg-[#EEF0F4] text-[#6B7280]",
      pinLabel: "Covered",
      detailCopy: "This zone already has enough drivers. Head to a different hotspot."
    };
  }

  if (canNavigate && hotspot.isHighConfidence) {
    return {
      routingDecision,
      canNavigate: true,
      isCovered: false,
      isSuppressed,
      badgeLabel: "98% certified",
      badgeClassName: "bg-emerald-50 text-emerald-700",
      actionLabel: "Drive there",
      actionClassName: "bg-black text-white",
      pinLabel: "Certified",
      detailCopy: "This recommendation is inside the high-confidence operating band."
    };
  }

  if (routingDecision === "avoid") {
    return {
      routingDecision,
      canNavigate: false,
      isCovered: false,
      isSuppressed: true,
      badgeLabel: "No-go",
      badgeClassName: "bg-[#FFF1F1] text-[#EF4444]",
      actionLabel: "Not recommended",
      actionClassName: "bg-[#FFF1F1] text-[#EF4444]",
      pinLabel: "No-go",
      detailCopy: "The model does not recommend routing drivers to this area right now."
    };
  }

  return {
    routingDecision,
    canNavigate: false,
    isCovered: false,
    isSuppressed,
    badgeLabel: "Advisory",
    badgeClassName: "bg-[#FFF7E6] text-[#B45309]",
    actionLabel: "Advisory only",
    actionClassName: "bg-[#FFF7E6] text-[#B45309]",
    pinLabel: "Advisory",
    detailCopy: hotspot.fallbackReason ?? "Below the certified confidence threshold, so treat this as guidance rather than a route command."
  };
}
