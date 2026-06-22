
import type { ReactNode } from "react";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  showHandle?: boolean;
  backdropClassName?: string;
}

export function BottomSheet({
  open,
  onClose,
  children,
  className,
  showHandle = true,
  backdropClassName
}: BottomSheetProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("fixed inset-0 z-40 bg-black/24 backdrop-blur-[2px]", backdropClassName)}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 rounded-t-[2rem] bg-white px-4 pb-6 pt-3 shadow-sheet",
              className
            )}
          >
            {showHandle ? (
              <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-line-strong" />
            ) : null}
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
