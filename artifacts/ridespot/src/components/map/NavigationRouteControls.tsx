
import { Check, ExternalLink, X } from "lucide-react";
import type { Hotspot, NavigationSession } from "@/types";

export interface NavigationRouteControlsProps {
  session: NavigationSession | null;
  hotspot: Hotspot | null;
  onOpenExternal: (hotspot: Hotspot) => void;
  onCancel: () => void;
  onComplete: () => void;
}

export function NavigationRouteControls({
  session,
  hotspot,
  onOpenExternal,
  onCancel,
  onComplete
}: NavigationRouteControlsProps) {
  if (!session || !hotspot) {
    return null;
  }

  return (
    <div className="absolute left-4 right-[5.5rem] z-30 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.16)] backdrop-blur" style={{ bottom: "calc(31% + 0.75rem)" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate [font-family:Inter,sans-serif] text-[0.75rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            {session.durationText} to {hotspot.name}
          </p>
          <p className="mt-1 [font-family:Inter,sans-serif] text-[0.68rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
            {session.distanceText}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenExternal(hotspot)}
            className="flex size-8 items-center justify-center rounded-full bg-black text-white"
            aria-label="Open in Google Maps"
          >
            <ExternalLink className="size-4" />
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="flex size-8 items-center justify-center rounded-full bg-[#009B63] text-white"
            aria-label="Complete route"
          >
            <Check className="size-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex size-8 items-center justify-center rounded-full bg-[#F3F4F6] text-ink"
            aria-label="Cancel route"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
