

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface DriverPinProps {
  className?: string;
  style?: CSSProperties;
}

export function DriverPin({ className, style }: DriverPinProps) {
  return (
    <div className={cn("absolute", className)} style={style}>
      <span className="absolute inset-0 animate-ping rounded-full bg-[#1F7BFF]/25" />
      <span className="relative block size-4 rounded-full border-[3px] border-[#1F7BFF] bg-white" />
    </div>
  );
}
