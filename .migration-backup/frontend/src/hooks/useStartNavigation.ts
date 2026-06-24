"use client";

import { navigationRepository } from "@/services/repositories";
import { useNavigationStore } from "@/store/navigation-store";
import { useToastStore } from "@/store/toast-store";
import type { DriverLocation, Hotspot } from "@/types";

export function useStartNavigation() {
  const setStarting = useNavigationStore((state) => state.setStarting);
  const setActiveSession = useNavigationStore((state) => state.setActiveSession);
  const setFailed = useNavigationStore((state) => state.setFailed);
  const showToast = useToastStore((state) => state.showToast);

  return async (hotspot: Hotspot, origin: DriverLocation) => {
    setStarting(hotspot, origin);

    try {
      const session = await navigationRepository.startSession(hotspot.id, origin);
      setActiveSession(session, hotspot);
      showToast({
        title: `Route ready: ${session.durationText}`,
        variant: "success"
      });
      return session;
    } catch {
      setFailed(hotspot);
      showToast({
        title: "Route is unavailable. You can still open Google Maps.",
        variant: "neutral"
      });
      throw new Error("Navigation route failed");
    }
  };
}
