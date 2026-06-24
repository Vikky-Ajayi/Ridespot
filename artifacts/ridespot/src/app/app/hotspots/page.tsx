

import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DesktopShell } from "@/components/app/DesktopShell";
import { HotspotCard } from "@/components/hotspot/HotspotCard";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useStartNavigation } from "@/hooks/useStartNavigation";
import { FALLBACK_DRIVER_LOCATION } from "@/lib/location";
import { eventRepository } from "@/services/repositories";
import { useModalStore } from "@/store/modal-store";
import type { Hotspot, HotspotSearchMetadata } from "@/types";

function formatRadius(meters: number, country?: string | null) {
  if (country === "UK") {
    return `${Math.round((meters / 1609.344) * 10) / 10} miles`;
  }

  return `${Math.round(meters / 1000)}km`;
}

export default function HotspotsPage() {
  const [, navigate] = useLocation();
  const { position } = useDriverLocation();
  const startNavigation = useStartNavigation();
  const openHotspotDetails = useModalStore((state) => state.openHotspotDetails);
  const [events, setEvents] = useState<Hotspot[]>([]);
  const [metadata, setMetadata] = useState<HotspotSearchMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedOnce = useRef(false);

  const queryLat = position?.lat ?? FALLBACK_DRIVER_LOCATION.lat;
  const queryLng = position?.lng ?? FALLBACK_DRIVER_LOCATION.lng;
  const displayCountry = events[0]?.country;

  useEffect(() => {
    let isActive = true;

    const isBackground = hasLoadedOnce.current;

    if (isBackground) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }

    eventRepository
      .getNearbyEvents(queryLat, queryLng, 15000, 3, 50)
      .then((result) => {
        if (!isActive) return;
        setEvents(result.events);
        setMetadata(result.metadata);
        hasLoadedOnce.current = true;
      })
      .catch(() => {
        if (!isActive) return;
        if (!hasLoadedOnce.current) {
          setError("Unable to load nearby events right now.");
        }
      })
      .finally(() => {
        if (!isActive) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      isActive = false;
    };
  }, [queryLat, queryLng]);

  const radiusCopy = metadata
    ? `Showing events for the next ${metadata.days ?? 3} days within ${formatRadius(
        metadata.effectiveRadiusMeters,
        displayCountry
      )}.`
    : "Showing events for the next 3 days near you.";
  const shortfallCopy = metadata?.shortfallReason ?? null;
  const excludedCopy = metadata?.excludedIncompleteEvents
    ? `${metadata.excludedIncompleteEvents} provider events were excluded because venue data was incomplete.`
    : null;

  return (
    <DesktopShell className="bg-[#F7F8FA]">
      <div className="flex h-full min-h-0 flex-col bg-[#F7F8FA] pb-[76px]">
        <AppHeader variant="hotspots" />

        <div className="px-4 pb-3 pt-4">
          <p className="text-[0.75rem] font-semibold uppercase tracking-[0.12em] text-[#667085]">
            Events near you
          </p>
          <h1 className="mt-1 text-[1.25rem] font-semibold leading-none tracking-[-0.03em] text-black">
            Next 3 days
          </h1>
          <p className="mt-2 text-[0.875rem] font-medium leading-tight text-[#667085]">
            {metadata?.copy ?? "Showing events for the next 3 days near you."}
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8">
          <div className="rounded-2xl bg-[#EEF7FF] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#1D4ED8]">
            {radiusCopy}
          </div>

          {shortfallCopy ? (
            <div className="rounded-2xl bg-[#FFF7ED] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#9A3412]">
              {shortfallCopy}
            </div>
          ) : null}

          {excludedCopy ? (
            <div className="rounded-2xl bg-[#FFF7ED] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#9A3412]">
              {excludedCopy}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl bg-[#FFF1F1] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#EF4444]">
              {error}
            </div>
          ) : null}

          {loading && !hasLoadedOnce.current ? (
            <div className="rounded-2xl bg-white px-4 py-5 text-[0.86rem] font-medium leading-tight text-[#667085]">
              Loading nearby events...
            </div>
          ) : null}

          {refreshing ? (
            <div className="rounded-2xl bg-[#EEF7FF] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#1D4ED8]">
              Checking for new events…
            </div>
          ) : null}

          {!loading && !error && events.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-5 text-[0.86rem] font-medium leading-tight text-[#667085]">
              No events were found near you for the next 3 days.
            </div>
          ) : null}

          {events.map((event) => (
            <HotspotCard
              key={event.id}
              hotspot={event}
              onDriveThere={(selectedHotspot) => {
                void startNavigation(selectedHotspot, position ?? FALLBACK_DRIVER_LOCATION)
                  .then(() => navigate("/app/home"))
                  .catch(() => undefined);
              }}
              onOpenDetails={openHotspotDetails}
            />
          ))}
        </div>

        <BottomNav active="hotspots" />
      </div>
    </DesktopShell>
  );
}
