"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Clock3, MapPin, X } from "lucide-react";
import { DemandByHourChart } from "@/components/hotspot/DemandByHourChart";
import { HotspotStatsGrid } from "@/components/hotspot/HotspotStatsGrid";
import { ModalSheet } from "@/components/app/ModalSheet";
import { getDemandColor } from "@/lib/demandColors";
import { getHotspotPolicyState } from "@/lib/hotspotPolicy";
import { cn } from "@/lib/utils";
import { hotspotRepository } from "@/services/repositories";
import type { Hotspot } from "@/types";

export interface HotspotDetailsProps {
  open: boolean;
  hotspot: Hotspot | null;
  onClose: () => void;
  onNavigate?: (hotspot: Hotspot) => void | Promise<void>;
}

export function HotspotDetails({
  open,
  hotspot,
  onClose,
  onNavigate
}: HotspotDetailsProps) {
  const [demandByHour, setDemandByHour] = useState<{
    values: number[];
    currentHourIndex: number;
    timeRange: string;
  } | null>(null);

  useEffect(() => {
    if (!open || !hotspot) {
      return;
    }

    if (hotspot.demandByHour.length) {
      setDemandByHour({
        values: hotspot.demandByHour,
        currentHourIndex: hotspot.currentHourIndex,
        timeRange: "7 PM — 2 AM"
      });
      return;
    }

    let cancelled = false;

    hotspotRepository
      .getDemandByHour(hotspot.id)
      .then((response) => {
        if (cancelled) {
          return;
        }

        setDemandByHour({
          values: response.values,
          currentHourIndex: response.currentHourIndex,
          timeRange: response.timeRange
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDemandByHour(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hotspot, open]);

  const displayHotspot = useMemo(() => {
    if (!hotspot) {
      return null;
    }

    if (!demandByHour) {
      return hotspot;
    }

    return {
      ...hotspot,
      demandByHour: demandByHour.values,
      currentHourIndex: demandByHour.currentHourIndex
    };
  }, [demandByHour, hotspot]);

  if (!displayHotspot) {
    return null;
  }

  const demand = getDemandColor(displayHotspot.demandLevel);
  const policy = getHotspotPolicyState(displayHotspot);

  return (
    <ModalSheet open={open} onClose={onClose} panelClassName="max-h-[88vh] overflow-hidden">
      <div className="flex max-h-[88vh] flex-col">
        <div className="flex items-center justify-between px-4 pb-3 pt-5">
          <h2 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            Hotspot Details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-[#F3F4F6] text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-5">
          <div className="flex gap-4">
            <div className="relative flex size-[72px] overflow-hidden rounded-2xl bg-[#E1E1E4]">
              {displayHotspot.image ? (
                <Image
                  src={displayHotspot.image}
                  alt={displayHotspot.name}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-[#F2F4F7] text-[#8A8F98]">
                  <MapPin className="size-6" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[1.12rem] font-bold text-ink">
                {displayHotspot.name}
                <span className="font-medium text-[#7A7A7A]"> · {displayHotspot.postcode}</span>
              </p>
              <p className="mt-2 text-[0.94rem] font-medium" style={{ color: demand.text }}>
                {demand.statusText}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-xl bg-[#ECEDEF] px-2.5 py-2 text-[0.92rem] font-semibold text-[#63666C]">
                  <Clock3 className="size-4" />
                  <span>{displayHotspot.timeRange}</span>
                </div>
                <span
                  className={cn(
                    "inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-semibold tracking-[-0.03em]",
                    policy.badgeClassName
                  )}
                >
                  {policy.badgeLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="my-4 h-px bg-[#E7E8EC]" />

          <div className="flex items-center justify-between">
            <p className="text-[1rem] font-medium text-[#5A5D63]">Live Demand Score</p>
            <p className="text-[1.9rem] font-bold tracking-[-0.06em] text-ink">
              {displayHotspot.liveScore}/100
            </p>
          </div>

          <div className="mt-3 h-1 rounded-full bg-[#E7E8EC]">
            <div
              className="h-full rounded-full bg-black"
              style={{ width: `${displayHotspot.liveScore}%` }}
            />
          </div>

          <div className="my-4 h-px bg-[#E7E8EC]" />

          <HotspotStatsGrid hotspot={displayHotspot} />

          <div className="mt-5 rounded-2xl bg-[#F5F6FA] p-4 text-[1rem] leading-[1.28] text-[#5F636A]">
            {displayHotspot.insightText}
          </div>

          <div
            className={cn(
              "mt-3 rounded-2xl px-4 py-3 text-[0.84rem] font-medium leading-snug",
              policy.badgeClassName
            )}
          >
            {policy.detailCopy}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <h3 className="text-[1.7rem] font-bold tracking-[-0.06em] text-ink">Demand by Hour</h3>
            <p className="text-[1rem] font-medium text-[#7A7A7A]">
              {demandByHour?.timeRange ?? "7 PM — 2 AM"}
            </p>
          </div>

          <div className="mt-4">
            <DemandByHourChart hotspot={displayHotspot} />
          </div>
        </div>

        <div className="px-4 pb-6 pt-2">
          {!policy.canNavigate ? (
            <div
              className={cn(
                "w-full rounded-2xl px-4 py-4 text-center text-[1.06rem] font-semibold",
                policy.actionClassName
              )}
            >
              {policy.actionLabel}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onNavigate?.(displayHotspot)}
              className={cn(
                "w-full rounded-2xl px-4 py-4 text-[1.06rem] font-semibold",
                policy.actionClassName
              )}
            >
              Navigate to this Spot
            </button>
          )}
        </div>
      </div>
    </ModalSheet>
  );
}
