import type { ReactNode } from "react";
import { Logo } from "@/components/layout/Logo";
import { cn } from "@/lib/utils";

export interface DesktopShellProps {
  children: ReactNode;
  className?: string;
}

export function DesktopShell({ children, className }: DesktopShellProps) {
  return (
    <div className="h-[100dvh] overflow-hidden bg-white md:flex md:items-center md:justify-center md:bg-[#3D434A]">
      <div className="mx-auto flex h-[100dvh] w-full flex-col bg-white md:max-w-[430px]">
        <div className="hidden h-[58px] shrink-0 items-center border-b border-line px-4 md:flex">
          <Logo className="scale-[0.98]" />
        </div>
        <div
          className={cn(
            "relative min-h-0 flex-1 bg-white",
            className
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
