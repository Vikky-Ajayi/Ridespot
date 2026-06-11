"use client";

import { useRouter } from "next/navigation";
import { DesktopShell } from "@/components/app/DesktopShell";
import { HotspotCard } from "@/components/hotspot/HotspotCard";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { useHotspots } from "@/hooks/useHotspots";
import { useStartNavigation } from "@/hooks/useStartNavigation";
import { FALLBACK_DRIVER_LOCATION } from "@/lib/location";
import { useHotspotStore } from "@/store/hotspot-store";
import { useModalStore } from "@/store/modal-store";
import { AUTHENTICATED_HOTSPOT_FILTERS } from "@/lib/demandColors";
import { cn } from "@/lib/utils";

export default function HotspotsPage() {
  const router = useRouter();
  const filter = useHotspotStore((state) => state.filter);
  const setFilter = useHotspotStore((state) => state.setFilter);
  const { hotspots, isStale, loading, position, metadata } = useHotspots(filter);
  const startNavigation = useStartNavigation();
  const openHotspotDetails = useModalStore((state) => state.openHotspotDetails);
  const metadataMessage = metadata?.shortfallReason
    ? metadata.shortfallReason
    : metadata?.expandedRadius
      ? `Showing live events up to ${Math.round(metadata.effectiveRadiusMeters / 1000)}km away.`
      : null;

  return (
    <DesktopShell className="bg-[#F7F8FA]">
      <div className="flex h-full min-h-0 flex-col bg-[#F7F8FA] pb-[76px]">
        <AppHeader variant="hotspots" />

        <div className="px-4 pb-4 pt-3">
          <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max gap-2">
            {AUTHENTICATED_HOTSPOT_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[0.8125rem] font-semibold leading-none tracking-[-0.03em]",
                  filter === item.value
                    ? "border-black bg-black text-white"
                    : "border-[#E5E7EB] bg-white text-[#6B7280]"
                )}
              >
                {item.label}
              </button>
            ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-8">
          {isStale ? (
            <div className="rounded-2xl bg-[#FFF7ED] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#9A3412]">
              Showing cached hotspot data. Live updates will resume when connection returns.
            </div>
          ) : null}

          {!isStale && metadataMessage ? (
            <div className="rounded-2xl bg-[#EEF7FF] px-3 py-2 text-[0.78rem] font-medium leading-tight text-[#1D4ED8]">
              {metadataMessage}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-2xl bg-white px-4 py-5 text-[0.86rem] font-medium leading-tight text-[#667085]">
              Loading hotspot suggestions...
            </div>
          ) : null}

          {!loading && !isStale && hotspots.length === 0 ? (
            <div className="rounded-2xl bg-white px-4 py-5 text-[0.86rem] font-medium leading-tight text-[#667085]">
              No live events ending soon were found near you. RideSpot only shows real live-event
              hotspots, so we won&apos;t invent advisory zones.
            </div>
          ) : null}

          {!loading
            ? hotspots.map((hotspot) => (
                <HotspotCard
                  key={hotspot.id}
                  hotspot={hotspot}
                  onDriveThere={(selectedHotspot) => {
                    void startNavigation(selectedHotspot, position ?? FALLBACK_DRIVER_LOCATION)
                      .then(() => router.push("/app/home"))
                      .catch(() => undefined);
                  }}
                  onOpenDetails={openHotspotDetails}
                />
              ))
            : null}
        </div>

        <BottomNav active="hotspots" />
      </div>
    </DesktopShell>
  );
}
