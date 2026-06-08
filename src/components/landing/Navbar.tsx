"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useId, useState } from "react";
import { PwaInstallButton } from "@/components/landing/PwaInstallButton";
import { PublicMobileNavigation } from "@/components/layout/PublicMobileNavigation";
import { Logo } from "@/components/layout/Logo";
import { MobileSidebar } from "@/components/ui/MobileSidebar";
import { publicNavCta, publicNavItems, type PublicNavItem } from "@/data/public-nav";
import { cn } from "@/lib/utils";

export interface NavbarProps {
  className?: string;
  items?: PublicNavItem[];
}

export function Navbar({ className, items }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const navItems = items ?? publicNavItems;

  return (
    <header className={cn("border-b border-line bg-white", className)}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6 lg:px-[14px]">
        <Logo />
        <nav className="hidden items-center gap-10 text-sm text-ink-muted md:flex">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="transition hover:text-ink">
              {item.label}
            </Link>
          ))}
          <PwaInstallButton />
          <Link
            href={publicNavCta.href}
            className="inline-flex min-h-12 min-w-32 items-center justify-center rounded-2xl bg-ink px-5 text-base font-semibold text-white transition duration-200 hover:bg-ink-soft"
          >
            {publicNavCta.label}
          </Link>
        </nav>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-controls={drawerId}
          aria-expanded={open}
          className="text-ink md:hidden"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X className="size-7" /> : <Menu className="size-7" />}
        </button>
      </div>
      <MobileSidebar id={drawerId} open={open} onClose={() => setOpen(false)}>
        <PublicMobileNavigation onNavigate={() => setOpen(false)} />
      </MobileSidebar>
    </header>
  );
}
