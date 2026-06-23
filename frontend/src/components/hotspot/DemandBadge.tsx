import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { DemandLevel } from "@/types";

export interface DemandBadgeProps {
  demandLevel: DemandLevel;
  label?: string;
}

export function DemandBadge({ demandLevel, label }: DemandBadgeProps) {
  return (
    <Badge
      variant="demand"
      demandLevel={demandLevel}
      leading={<Flame className="size-4" />}
    >
      {label}
    </Badge>
  );
}
