
import type { CSSProperties } from "react";
import { Flame } from "lucide-react";
import { getDemandBorderColor, getDemandColor } from "@/lib/demandColors";
import { getHotspotPolicyState } from "@/lib/hotspotPolicy";
import { cn } from "@/lib/utils";
import type { Hotspot } from "@/types";

export interface DemandPinProps {
  hotspot: Hotspot;
  className?: string;
  style?: CSSProperties;
  onClick?: (hotspot: Hotspot) => void;
}

export function DemandPin({ hotspot, className, style, onClick }: DemandPinProps) {
  const demand = getDemandColor(hotspot.demandLevel);
  const borderColor = getDemandBorderColor(hotspot.demandLevel);
  const policy = getHotspotPolicyState(hotspot);

  return (
    <button
      type="button"
      onClick={() => onClick?.(hotspot)}
      className={cn(
        "absolute flex flex-col items-center gap-1.5",
        policy.isSuppressed && "opacity-70",
        className
      )}
      style={style}
    >
      <div
        className="rounded-2xl border bg-white px-3 py-2 text-left shadow-[0_8px_16px_rgba(17,24,39,0.12)]"
        style={{ borderColor }}
      >
        <p className="text-[0.94rem] font-bold leading-tight" style={{ color: demand.text }}>
          {demand.label}
        </p>
        <p className="mt-0.5 text-[0.82rem] font-medium leading-tight text-[#63666C]">
          {policy.pinLabel}
        </p>
      </div>
      <span className="h-0 w-0 border-x-[8px] border-t-[10px] border-x-transparent border-t-white" />
      <div
        className="flex size-11 items-center justify-center rounded-full shadow-[0_8px_20px_rgba(17,24,39,0.14)]"
        style={{ backgroundColor: demand.pin }}
      >
        <Flame className="size-5 fill-white text-white" />
      </div>
    </button>
  );
}
