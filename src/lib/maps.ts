import type { Hotspot } from "@/types";

export function openGoogleMapsDirections(hotspot: Hotspot) {
  if (typeof window === "undefined") {
    return;
  }

  const url = `https://www.google.com/maps/dir/?api=1&destination=${hotspot.lat},${hotspot.lng}&travelmode=driving`;
  window.open(url, "_blank", "noopener,noreferrer");
}
