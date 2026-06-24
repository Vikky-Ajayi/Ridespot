
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ToggleProps {
  checked: boolean;
  onChange: (nextValue: boolean) => void;
  className?: string;
  ariaLabel: string;
}

export function Toggle({ checked, onChange, className, ariaLabel }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex h-7 w-10 items-center rounded-full p-0.5 transition",
        checked ? "bg-brand" : "bg-[#9FA6B2]",
        className
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="block size-6 rounded-full bg-white shadow-sm"
        style={{ marginLeft: checked ? "auto" : 0 }}
      />
    </button>
  );
}
