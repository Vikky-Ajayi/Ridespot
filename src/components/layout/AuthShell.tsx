"use client";

import type { FormHTMLAttributes, ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useId, useState } from "react";
import { DeviceShell } from "@/components/layout/DeviceShell";
import { Logo } from "@/components/layout/Logo";
import { PublicMobileNavigation } from "@/components/layout/PublicMobileNavigation";
import { MobileSidebar } from "@/components/ui/MobileSidebar";
import { cn } from "@/lib/utils";

export interface AuthShellProps {
  children: ReactNode;
  footer: ReactNode;
  className?: string;
  formProps?: FormHTMLAttributes<HTMLFormElement>;
}

export function AuthShell({ children, footer, className, formProps }: AuthShellProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();
  const content = formProps ? (
    <form {...formProps} className={cn("flex flex-1 flex-col", formProps.className)}>
      <div className="flex-1 px-4 pb-10 pt-0">{children}</div>
      <div className="px-4 pb-10 pt-4">{footer}</div>
    </form>
  ) : (
    <>
      <div className="flex-1 px-4 pb-10 pt-0">{children}</div>
      <div className="px-4 pb-10 pt-4">{footer}</div>
    </>
  );

  return (
    <DeviceShell className={cn("overflow-hidden", className)}>
      <header className="border-b border-line px-4 pb-4 pwa-safe-top">
        <div className="flex items-center justify-between">
          <Logo />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-controls={drawerId}
            aria-expanded={open}
            className="text-ink"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? <X className="size-7" /> : <Menu className="size-7" />}
          </button>
        </div>
      </header>
      <main className="flex flex-1 flex-col">{content}</main>
      <MobileSidebar id={drawerId} open={open} onClose={() => setOpen(false)}>
        <PublicMobileNavigation onNavigate={() => setOpen(false)} />
      </MobileSidebar>
    </DeviceShell>
  );
}
