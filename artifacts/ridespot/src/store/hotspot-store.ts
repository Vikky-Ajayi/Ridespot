
import { create } from "zustand";
import type { DemandLevel } from "@/lib/demandColors";
import type { Hotspot, HotspotSearchMetadata } from "@/types";

interface HotspotState {
  hotspots: Hotspot[];
  generatedAt: string | null;
  isStale: boolean;
  metadata: HotspotSearchMetadata | null;
  filter: "all" | Exclude<DemandLevel, "very-high">;
  homeSheetState: "peek" | "expanded";
  setHotspots: (
    hotspots: Hotspot[],
    generatedAt?: string | null,
    isStale?: boolean,
    metadata?: HotspotSearchMetadata | null
  ) => void;
  addOrUpdateHotspot: (hotspot: Hotspot) => void;
  markZoneCovered: (hotspotId: string) => void;
  getCachedHotspots: () => Hotspot[];
  setFilter: (filter: "all" | Exclude<DemandLevel, "very-high">) => void;
  setHomeSheetState: (state: "peek" | "expanded") => void;
}

export const useHotspotStore = create<HotspotState>((set) => ({
  hotspots: [],
  generatedAt: null,
  isStale: false,
  metadata: null,
  filter: "all",
  homeSheetState: "peek",
  setHotspots: (hotspots, generatedAt = null, isStale = false, metadata = null) =>
    set({ hotspots, generatedAt, isStale, metadata }),
  addOrUpdateHotspot: (hotspot) =>
    set((state) => ({
      hotspots: state.hotspots.some((item) => item.id === hotspot.id)
        ? state.hotspots.map((item) => (item.id === hotspot.id ? { ...item, ...hotspot } : item))
        : [hotspot, ...state.hotspots],
      isStale: false,
      generatedAt: hotspot.generatedAt ?? state.generatedAt
    })),
  markZoneCovered: (hotspotId) =>
    set((state) => ({
      hotspots: state.hotspots.map((hotspot) =>
        hotspot.id === hotspotId
          ? {
              ...hotspot,
              isCovered: true,
              canNavigate: false,
              isSuppressed: true,
              driverSaturation: "HIGH",
              driversInZone: hotspot.driversNeeded ?? hotspot.driversInZone
            }
          : hotspot
      )
    })),
  getCachedHotspots: () => {
    if (typeof window === "undefined") {
      return [];
    }

    try {
      const cached = window.localStorage.getItem("ridespot_hotspots_cache");
      return cached ? (JSON.parse(cached) as Hotspot[]) : [];
    } catch {
      return [];
    }
  },
  setFilter: (filter) => set({ filter }),
  setHomeSheetState: (state) => set({ homeSheetState: state })
}));
