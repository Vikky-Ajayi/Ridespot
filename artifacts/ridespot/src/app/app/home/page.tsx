
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { DesktopShell } from "@/components/app/DesktopShell";
import { HotspotCard } from "@/components/hotspot/HotspotCard";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { MapContainer } from "@/components/map/MapContainer";
import { NavigationRouteControls } from "@/components/map/NavigationRouteControls";
import { useHotspots } from "@/hooks/useHotspots";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { usePlacesAutocomplete } from "@/hooks/usePlacesAutocomplete";
import { useStartNavigation } from "@/hooks/useStartNavigation";
import { useToast } from "@/hooks/useToast";
import { FALLBACK_DRIVER_LOCATION } from "@/lib/location";
import { openGoogleMapsDirections } from "@/lib/maps";
import { navigationRepository } from "@/services/repositories";
import { useHotspotStore } from "@/store/hotspot-store";
import { useModalStore } from "@/store/modal-store";
import { useNavigationStore } from "@/store/navigation-store";
import { cn } from "@/lib/utils";
import type { DriverLocation, Hotspot } from "@/types";

export default function HomePage() {
  const searchParams = useLocationSearchParams();
  const {
    value,
    setValue,
    suggestions,
    isLoading: isSearchLoading,
    error: searchError,
    selectSuggestion
  } = usePlacesAutocomplete();
  const { allHotspots, position, isStale, loading, refreshPosition, metadata } = useHotspots();
  const { showToast } = useToast();
  const startNavigation = useStartNavigation();
  const [mapFocusLocation, setMapFocusLocation] = useState<DriverLocation | null>(null);
  const homeSheetState = useHotspotStore((state) => state.homeSheetState);
  const setHomeSheetState = useHotspotStore((state) => state.setHomeSheetState);
  const openHotspotDetails = useModalStore((state) => state.openHotspotDetails);
  const navigationStatus = useNavigationStore((state) => state.status);
  const activeSession = useNavigationStore((state) => state.activeSession);
  const navigationHotspot = useNavigationStore((state) => state.selectedHotspot);
  const previewOrigin = useNavigationStore((state) => state.previewOrigin);
  const previewDestination = useNavigationStore((state) => state.previewDestination);
  const clearNavigation = useNavigationStore((state) => state.clearNavigation);

  const isExpanded = homeSheetState === "expanded";

  const sortedHotspots = useMemo(() => {
    const now = Date.now();
    const cutoff = now + 48 * 60 * 60 * 1000;
    return [...allHotspots]
      .filter((h) => {
        if (!h.activeTimeStart) return true;
        const t = new Date(h.activeTimeStart).getTime();
        return t <= cutoff;
      })
      .sort((a, b) => {
        const aTime = a.activeTimeStart ? new Date(a.activeTimeStart).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.activeTimeStart ? new Date(b.activeTimeStart).getTime() : Number.MAX_SAFE_INTEGER;
        return aTime - bTime;
      });
  }, [allHotspots]);
  const navigationOverlay =
    navigationStatus === "starting" && previewOrigin && previewDestination
      ? {
          status: "starting" as const,
          origin: previewOrigin,
          destination: previewDestination
        }
      : navigationStatus === "active" && activeSession
        ? {
            status: "active" as const,
            origin: activeSession.origin,
            destination: activeSession.destination,
            encodedPolyline: activeSession.encodedPolyline,
            arrivalTime: activeSession.arrivalTime
          }
        : null;

  const handleStartNavigation = (hotspot: Hotspot) => {
    const origin = position ?? FALLBACK_DRIVER_LOCATION;
    void startNavigation(hotspot, origin).catch(() => undefined);
  };

  const handleCancelNavigation = () => {
    const session = clearNavigation();
    if (session?.status === "active") {
      void navigationRepository.cancelSession(session.id).catch(() => undefined);
    }
  };

  const handleCompleteNavigation = () => {
    const session = clearNavigation();
    if (session?.status === "active") {
      void navigationRepository.completeSession(session.id).catch(() => undefined);
    }
  };

  useEffect(() => {
    setHomeSheetState(searchParams.get("sheet") === "expanded" ? "expanded" : "peek");
  }, [searchParams, setHomeSheetState]);

  return (
    <DesktopShell className="overflow-hidden bg-white">
      <div className="flex h-full min-h-0 flex-col bg-white pb-[76px]">
        <AppHeader variant="home" />

        <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
          {!isExpanded ? (
            <MapContainer
              hotspots={allHotspots}
              driverLocation={position}
              focusLocation={mapFocusLocation}
              navigationOverlay={navigationOverlay}
              query={value}
              onQueryChange={setValue}
              searchSuggestions={suggestions}
              isSearchLoading={isSearchLoading}
              searchError={searchError}
              onSelectSearchSuggestion={(suggestion) => {
                void selectSuggestion(suggestion).then((place) => {
                  if (place.location) {
                    setMapFocusLocation(place.location);
                  }
                  showToast({
                    title: place.location ? `Selected ${place.name}` : "Place selected",
                    variant: "neutral"
                  });
                });
              }}
              onSelectHotspot={openHotspotDetails}
              onRecenter={() => {
                void refreshPosition().then((nextPosition) => {
                  setMapFocusLocation(nextPosition);
                  showToast({
                    title: "Recentered to your Location",
                    variant: "neutral"
                  });
                });
              }}
            />
          ) : null}

          <NavigationRouteControls
            session={navigationStatus === "active" ? activeSession : null}
            hotspot={navigationHotspot}
            onOpenExternal={openGoogleMapsDirections}
            onCancel={handleCancelNavigation}
            onComplete={handleCompleteNavigation}
          />

          <motion.section
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.08}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            animate={{ height: isExpanded ? "100%" : "31%" }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 70) {
                setHomeSheetState("peek");
              }

              if (info.offset.y < -70) {
                setHomeSheetState("expanded");
              }
            }}
            className="absolute inset-x-0 bottom-0 z-20 rounded-t-[32px] bg-white shadow-[0_-18px_42px_rgba(15,23,42,0.15)]"
          >
            <div className="flex justify-center pt-2">
              <span className="h-1.5 w-16 rounded-full bg-[#DADCE1]" />
            </div>

            <div className="flex items-start justify-between px-4 pt-5">
              <div>
                <h2 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
                  Top Hotspots
                </h2>
                <p className="mt-1 [font-family:Inter,sans-serif] text-[0.875rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
                  Recommended areas with high demand
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHomeSheetState(isExpanded ? "peek" : "expanded")}
                className="mt-1 inline-flex items-center gap-1 [font-family:Inter,sans-serif] text-[0.75rem] font-semibold leading-none tracking-[-0.03em] text-ink"
              >
                <span>See all</span>
                <ChevronRight className="size-4" />
              </button>
            </div>

            <div
              className={cn(
                "px-4 pt-4",
                isExpanded ? "h-[calc(100%-5.35rem)] overflow-y-auto pb-6" : "overflow-hidden pb-4"
              )}
            >
              {isStale ? (
                <div className="mb-3 rounded-2xl bg-[#FFF7ED] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#9A3412]">
                  Showing cached hotspot data. Live updates will resume when connection returns.
                </div>
              ) : null}

              <div className="space-y-4">
                {loading ? (
                  <div className="rounded-2xl bg-[#F4F6F8] px-4 py-4 text-[0.82rem] font-medium leading-tight text-[#667085]">
                    Loading hotspot suggestions...
                  </div>
                ) : null}

                {!loading && !isStale && sortedHotspots.length === 0 ? (
                  <div className="rounded-2xl bg-[#F4F6F8] px-4 py-4 text-[0.82rem] font-medium leading-tight text-[#667085]">
                    No upcoming events were found near you. Check back soon.
                  </div>
                ) : null}

                {!loading
                  ? sortedHotspots.map((hotspot) => (
                      <HotspotCard
                        key={hotspot.id}
                        hotspot={hotspot}
                        onDriveThere={handleStartNavigation}
                        onOpenDetails={openHotspotDetails}
                      />
                    ))
                  : null}
              </div>
            </div>
          </motion.section>
        </div>

        <BottomNav active="home" />
      </div>
    </DesktopShell>
  );
}
