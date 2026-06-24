"use client";

import { Link } from 'wouter';
import { Flame, House, UserRound } from "lucide-react";
import { useLocationSearchParams } from "@/hooks/useLocationSearchParams";
import { cn } from "@/lib/utils";

export interface BottomNavProps {
  active: "home" | "hotspots" | "profile";
}

const NAV_ITEMS = [
  { key: "home", label: "Home", href: "/app/home", icon: House },
  { key: "hotspots", label: "Hotspots", href: "/app/hotspots", icon: Flame },
  { key: "profile", label: "Profile", href: "/app/profile", icon: UserRound }
] as const;

export function BottomNav({ active }: BottomNavProps) {
  const searchParams = useLocationSearchParams();
  const preview = searchParams.get("preview") === "app";

  const withPreview = (href: string) => (preview ? `${href}?preview=app` : href);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 md:left-1/2 md:right-auto md:w-[430px] md:-translate-x-1/2">
      <nav
        className="grid grid-cols-3 bg-black px-5 pt-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        {NAV_ITEMS.map(({ key, label, href, icon: Icon }) => {
          const isActive = active === key;

          return (
            <Link
              key={key}
              href={withPreview(href)}
              className="flex min-h-[64px] flex-col items-center justify-center gap-1"
            >
              <Icon
                className={cn(
                  "size-5 transition-colors",
                  isActive ? "fill-white text-white" : "text-[#8F96A3]"
                )}
              />
              <span
                className={cn(
                  "text-[0.68rem] font-medium",
                  isActive ? "text-white" : "text-[#8F96A3]"
                )}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
