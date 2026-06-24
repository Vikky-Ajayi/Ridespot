

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface NotificationToggleProps {
  checked: boolean;
  onChange: () => void;
}

export function NotificationToggle({ checked, onChange }: NotificationToggleProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onChange();
      }}
      className={cn(
        "relative flex h-6 w-11 items-center rounded-full px-0.5 transition-colors",
        checked ? "bg-[#00D46A]" : "bg-[#9CA3AF]"
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className={cn("block size-5 rounded-full bg-white shadow-sm", checked ? "ml-auto" : "")}
      />
    </button>
  );
}
