
import { Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RecenterButtonProps {
  onClick: () => void;
  className?: string;
}

export function RecenterButton({ onClick, className }: RecenterButtonProps) {
  return (
    <button
      type="button"
      aria-label="Recenter map to your location"
      onClick={onClick}
      className={cn(
        "pointer-events-auto flex size-14 items-center justify-center rounded-[18px] bg-black text-white shadow-lg",
        className
      )}
    >
      <Crosshair className="size-6" />
    </button>
  );
}
