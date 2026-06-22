import type { ReactNode } from "react";
import { getDemandVisual } from "@/lib/demand";
import type { DemandLevel } from "@/types";
import { cn } from "@/lib/utils";

type BadgeVariant = "neutral" | "success" | "demand";

export interface BadgeProps {
  children?: ReactNode;
  variant?: BadgeVariant;
  demandLevel?: DemandLevel;
  className?: string;
  leading?: ReactNode;
}

export function Badge({
  children,
  variant = "neutral",
  demandLevel,
  className,
  leading
}: BadgeProps) {
  const demandVisual = demandLevel ? getDemandVisual(demandLevel) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold",
        variant === "neutral" && "bg-canvas-subtle text-ink",
        variant === "success" && "bg-brand-soft text-brand-deep",
        variant === "demand" &&
          demandVisual &&
          `border`,
        className
      )}
      style={
        variant === "demand" && demandVisual
          ? {
              backgroundColor: demandVisual.backgroundColor,
              color: demandVisual.textColor,
              borderColor: demandVisual.borderColor
            }
          : undefined
      }
    >
      {leading}
      <span>{children ?? demandVisual?.label}</span>
    </span>
  );
}
