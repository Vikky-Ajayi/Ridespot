"use client";

import Link from "next/link";
import { publicNavCta, publicNavItems } from "@/data/public-nav";

export interface PublicMobileNavigationProps {
  onNavigate?: () => void;
}

export function PublicMobileNavigation({ onNavigate }: PublicMobileNavigationProps) {
  return (
    <nav className="flex flex-1 flex-col">
      <div className="flex flex-col gap-5 text-lg font-medium text-ink">
        {publicNavItems.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="transition hover:text-brand"
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <Link
        href={publicNavCta.href}
        className="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-ink px-6 text-base font-semibold text-white transition duration-200 hover:bg-ink-soft"
        onClick={onNavigate}
      >
        {publicNavCta.label}
      </Link>
    </nav>
  );
}
