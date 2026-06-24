

import { CalendarDays, ChevronRight, Clock3, MapPin } from "lucide-react";
import { HotspotStatsGrid } from "@/components/hotspot/HotspotStatsGrid";
import { getDemandColor } from "@/lib/demandColors";
import { getHotspotPolicyState } from "@/lib/hotspotPolicy";
import { cn } from "@/lib/utils";
import { hotspotRepository } from "@/services/repositories";
import type { Hotspot } from "@/types";

export interface HotspotCardProps {
  hotspot: Hotspot;
  onDriveThere?: (hotspot: Hotspot) => void;
  onOpenDetails?: (hotspot: Hotspot) => void;
  className?: string;
}

export function HotspotCard({
  hotspot,
  onDriveThere,
  onOpenDetails,
  className
}: HotspotCardProps) {
  const demand = getDemandColor(hotspot.demandLevel);
  const policy = getHotspotPolicyState(hotspot);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails?.(hotspot)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails?.(hotspot);
        }
      }}
      className={cn(
        "rounded-[22px] border border-[#D7DAE1] bg-white p-3 shadow-[0_4px_10px_rgba(15,23,42,0.04)]",
        className
      )}
    >
      <div className="flex gap-3">
        <div className="relative flex size-20 overflow-hidden rounded-2xl bg-[#E5E7EB]">
          {hotspot.image ? (
            <img src={hotspot.image} alt={hotspot.name} className="object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-[#F2F4F7] text-[#8A8F98]">
              <MapPin className="size-7" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[1.1rem] font-bold leading-tight text-ink">
            {hotspot.name}
            <span className="font-medium text-[#7A7A7A]"> · {hotspot.postcode}</span>
          </p>
          <p
            className="[font-family:Inter,sans-serif] mt-2 text-[0.75rem] font-medium leading-none tracking-[-0.03em]"
            style={{ color: demand.text }}
          >
            {demand.statusText}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {hotspot.activeTimeStart ? (
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#ECEDEF] px-2.5 py-2 text-[0.92rem] font-semibold text-[#63666C]">
                <CalendarDays className="size-4" />
                <span>
                  {new Date(hotspot.activeTimeStart).toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short"
                  })}
                </span>
              </div>
            ) : null}
            <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#ECEDEF] px-2.5 py-2 text-[0.92rem] font-semibold text-[#63666C]">
              <Clock3 className="size-4" />
              <span>{hotspot.timeRange}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="my-3 h-px bg-[#E7E8EC]" />

      <HotspotStatsGrid hotspot={hotspot} />

      <div className="mt-4 flex justify-end">
        {!policy.canNavigate ? (
          <span
            className={cn(
              "inline-flex items-center rounded-[14px] px-4 py-2.5 text-[0.92rem] font-semibold",
              policy.actionClassName
            )}
          >
            {policy.actionLabel}
          </span>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              void hotspotRepository.navigate(hotspot.id).catch(() => undefined);
              onDriveThere?.(hotspot);
            }}
            className={cn(
              "inline-flex items-center gap-1 rounded-[14px] px-4 py-2.5 text-[0.92rem] font-semibold",
              policy.actionClassName
            )}
          >
            <span>{policy.actionLabel}</span>
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
