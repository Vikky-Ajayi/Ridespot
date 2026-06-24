

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ModalSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
}

export function ModalSheet({ open, onClose, children, panelClassName }: ModalSheetProps) {
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="overlay"
            type="button"
            aria-label="Close modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.08}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            onClick={(event) => event.stopPropagation()}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 900) {
                onClose();
              }
            }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50 rounded-t-[32px] bg-white shadow-sheet md:left-1/2 md:right-auto md:w-[430px] md:-translate-x-1/2",
              panelClassName
            )}
            role="dialog"
            aria-modal="true"
          >
            {children}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
