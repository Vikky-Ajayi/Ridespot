"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MobileSidebarProps {
  id: string;
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function MobileSidebar({
  id,
  open,
  title = "Menu",
  onClose,
  children,
  className
}: MobileSidebarProps) {
  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const body = document.body;
    const previousOverflow = body.style.overflow;
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        onClose();
      }
    };

    body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    if (mediaQuery.matches) {
      onClose();
    } else {
      mediaQuery.addEventListener("change", handleBreakpointChange);
    }

    return () => {
      body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      mediaQuery.removeEventListener("change", handleBreakpointChange);
    };
  }, [onClose, open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="mobile-sidebar-backdrop"
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[70] bg-black/36 backdrop-blur-[2px] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onClick={onClose}
          />
          <motion.aside
            key="mobile-sidebar-panel"
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              "fixed inset-y-0 right-0 z-[80] flex w-[min(22rem,84vw)] flex-col border-l border-line bg-white px-5 pb-6 pt-5 shadow-soft md:hidden",
              className
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-ink-muted">
                {title}
              </p>
              <button
                type="button"
                aria-label="Close menu"
                className="inline-flex size-11 items-center justify-center rounded-2xl border border-line text-ink transition hover:border-brand hover:text-brand"
                onClick={onClose}
              >
                <X className="size-6" />
              </button>
            </div>
            <div className="mt-8 flex flex-1 flex-col">{children}</div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
