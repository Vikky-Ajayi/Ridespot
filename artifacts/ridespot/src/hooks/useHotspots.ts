"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DemandLevel } from "@/lib/demandColors";
import type { Hotspot } from "@/types";
import { hotspotRepository } from "@/services/repositories";
import { mapHotspot, type BackendHotspot } from "@/services/repositories/shared";
import { useHotspotStore } from "@/store/hotspot-store";
import { useToastStore } from "@/store/toast-store";
import { useDriverLocation } from "./useDriverLocation";
import { useSSEHotspots } from "./useSSEHotspots";

function cacheHotspots(hotspots: Hotspot[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem("ridespot_hotspots_cache", JSON.stringify(hotspots));
  } catch {
    // Local storage can fail in private browsing or low-storage states.
  }
}

function normaliseIncomingHotspot(hotspot: Hotspot | BackendHotspot): Hotspot {
  if ("driveTime" in hotspot && "lat" in hotspot && "demandLevel" in hotspot) {
    return hotspot;
  }

  return mapHotspot(hotspot as BackendHotspot);
}

export function useHotspots(filter: "all" | Exclude<DemandLevel, "very-high"> = "all") {
  const { position, refreshPosition, socket } = useDriverLocation();
  const hotspots = useHotspotStore((state) => state.hotspots);
  const generatedAt = useHotspotStore((state) => state.generatedAt);
  const isStale = useHotspotStore((state) => state.isStale);
  const metadata = useHotspotStore((state) => state.metadata);
  const setHotspots = useHotspotStore((state) => state.setHotspots);
  const addOrUpdateHotspot = useHotspotStore((state) => state.addOrUpdateHotspot);
  const markZoneCovered = useHotspotStore((state) => state.markZoneCovered);
  const getCachedHotspots = useHotspotStore((state) => state.getCachedHotspots);
  const showToast = useToastStore((state) => state.showToast);
  const [loading, setLoading] = useState(true);

  // SSE: receive server-pushed hotspot updates alongside socket.io
  const handleSSEUpdate = useCallback(
    (updated: Hotspot[]) => {
      if (updated.length === 0) return;
      setHotspots(updated, new Date().toISOString());
      cacheHotspots(updated);
    },
    [setHotspots],
  );
  useSSEHotspots(handleSSEUpdate);

  useEffect(() => {
    if (!position) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    hotspotRepository
      .getHotspots(position.lat, position.lng)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setHotspots(response.hotspots, response.generatedAt, false, response.metadata);
        cacheHotspots(response.hotspots);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        const cached = getCachedHotspots();
        if (cached.length) {
          setHotspots(cached, null, true, null);
        } else {
          setHotspots([], null, true, null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getCachedHotspots, position?.lat, position?.lng, setHotspots]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleHotspotsUpdated = (payload: {
      hotspots: Array<Hotspot | BackendHotspot>;
      generatedAt?: string;
    }) => {
      const updated = payload.hotspots.map(normaliseIncomingHotspot);
      setHotspots(updated, payload.generatedAt ?? new Date().toISOString());
      cacheHotspots(updated);
    };

    const handleHotspotAlert = (payload: {
      hotspot: Hotspot | BackendHotspot;
      driversNeeded?: number;
    }) => {
      const hotspot = normaliseIncomingHotspot(payload.hotspot);
      addOrUpdateHotspot(hotspot);
      cacheHotspots(useHotspotStore.getState().hotspots);

      showToast({
        title: `${hotspot.name} needs ${payload.driversNeeded ?? hotspot.driversNeeded ?? 1} more drivers`,
        variant: "alert"
      });
    };

    const handleHotspotCovered = (payload: { hotspotId: string; message?: string }) => {
      markZoneCovered(payload.hotspotId);
      cacheHotspots(useHotspotStore.getState().hotspots);

      showToast({
        title: payload.message ?? "This zone is now covered",
        variant: "info"
      });
    };

    socket.on("hotspots:updated", handleHotspotsUpdated);
    socket.on("hotspot:alert", handleHotspotAlert);
    socket.on("hotspot:covered", handleHotspotCovered);

    return () => {
      socket.off("hotspots:updated", handleHotspotsUpdated);
      socket.off("hotspot:alert", handleHotspotAlert);
      socket.off("hotspot:covered", handleHotspotCovered);
    };
  }, [addOrUpdateHotspot, markZoneCovered, setHotspots, showToast, socket]);

  const filteredHotspots = useMemo<Hotspot[]>(() => {
    if (filter === "all") {
      return hotspots;
    }

    return hotspots.filter((hotspot) => hotspot.demandLevel === filter);
  }, [filter, hotspots]);

  return {
    hotspots: filteredHotspots,
    allHotspots: hotspots,
    generatedAt,
    isStale,
    metadata,
    loading,
    position,
    refreshPosition,
    socket
  };
}
