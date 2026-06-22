import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface DeviceShellProps {
  children: ReactNode;
  className?: string;
}

export function DeviceShell({ children, className }: DeviceShellProps) {
  return (
    <div className="min-h-screen bg-canvas-gutter px-0 md:px-6">
      <div
        className={cn(
          "mx-auto flex min-h-screen w-full max-w-[390px] flex-col bg-white shadow-soft",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
