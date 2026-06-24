import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageWrapperProps {
  children: ReactNode;
  className?: string;
  withAppGutters?: boolean;
}

export function PageWrapper({
  children,
  className,
  withAppGutters = false
}: PageWrapperProps) {
  return (
    <div className={cn(withAppGutters && "min-h-screen bg-canvas-gutter", className)}>
      <div className={cn(withAppGutters && "mx-auto screen-container")}>{children}</div>
    </div>
  );
}
