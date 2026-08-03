import { Clock3, Route, UsersRound } from "lucide-react";
import type { Hotspot } from "@/types";
import { cn } from "@/lib/utils";

export interface HotspotStatsGridProps {
  hotspot: Hotspot;
  className?: string;
}

export function HotspotStatsGrid({ hotspot, className }: HotspotStatsGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      <div className="flex items-start gap-1.5">
        <Clock3 className="mt-0.5 size-4 text-[#7A7A7A]" />
        <div>
          <p className="whitespace-nowrap [font-family:Inter,sans-serif] text-[0.625rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
            Drive time
          </p>
          <p className="mt-0.5 text-[0.94rem] font-semibold leading-none text-ink">
            {hotspot.driveTime}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-1.5">
        <Route className="mt-0.5 size-4 text-[#7A7A7A]" />
        <div>
          <p className="whitespace-nowrap [font-family:Inter,sans-serif] text-[0.625rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
            Distance
          </p>
          <p className="mt-0.5 text-[0.94rem] font-semibold leading-none text-ink">
            {hotspot.distance}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-1.5">
        <UsersRound className="mt-0.5 size-4 text-[#7A7A7A]" />
        <div>
          <p className="whitespace-nowrap [font-family:Inter,sans-serif] text-[0.625rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
            Driver Saturation
          </p>
          <p className="mt-0.5 text-[0.94rem] font-semibold leading-none text-ink">
            {hotspot.driverSaturation}
          </p>
        </div>
      </div>
    </div>
  );
}
