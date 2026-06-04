"use client";

import { Bell, UserRound } from "lucide-react";
import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

type AppHeaderVariant = "home" | "hotspots" | "profile";

export interface AppHeaderProps {
  variant: AppHeaderVariant;
  className?: string;
}

function OnlineBadge() {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-[#E8FAEF] px-2.5 py-1.5 text-[0.76rem] font-semibold text-[#00A856]">
      <span className="size-[0.4rem] rounded-full bg-[#00A856]" />
      <span>Online</span>
    </div>
  );
}

function AvatarMark() {
  return (
    <div className="flex size-10 items-center justify-center rounded-full bg-[#FF5656] text-white">
      <UserRound className="size-5 fill-white text-white" />
    </div>
  );
}

export function AppHeader({ variant, className }: AppHeaderProps) {
  const { user } = useAuth();
  const firstName = useMemo(() => {
    const rawName = user?.fullName?.trim();
    return rawName ? rawName.split(/\s+/)[0] : "Driver";
  }, [user?.fullName]);

  return (
    <header className={cn("bg-white px-4 pb-4 pt-4", className)}>
      <div
        className={cn(
          "flex justify-between gap-3",
          variant === "profile" ? "items-center" : "items-start"
        )}
      >
        {variant === "home" ? (
          <div className="flex items-center gap-3">
            <AvatarMark />
            <div className="leading-tight">
              <p className="[font-family:Inter,sans-serif] text-[0.875rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
                Welcome
              </p>
              <p className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
                {firstName}{"\u{1F44B}"}
              </p>
            </div>
          </div>
        ) : variant === "hotspots" ? (
          <div className="leading-tight">
            <h1 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
              Hotspot Alerts
            </h1>
            <p className="mt-1 [font-family:Inter,sans-serif] text-[0.875rem] font-medium leading-none tracking-[-0.03em] text-[#7A7A7A]">
              Live demand signals near you
            </p>
          </div>
        ) : (
          <div className="leading-tight">
            <h1 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
              Profile
            </h1>
          </div>
        )}

        <div className="flex items-center gap-3">
          <OnlineBadge />
          <button
            type="button"
            aria-label="Notifications"
            className="flex size-10 items-center justify-center rounded-full text-ink"
          >
            <Bell className="size-6" />
          </button>
        </div>
      </div>
    </header>
  );
}
