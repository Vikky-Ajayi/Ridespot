"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BellRing, Check, Info, MapPinned } from "lucide-react";
import type { ToastMessage } from "@/types";
import { cn } from "@/lib/utils";

export interface ToastProps {
  toast: ToastMessage | null;
  className?: string;
}

export function Toast({ toast, className }: ToastProps) {
  const Icon =
    toast?.variant === "success"
      ? Check
      : toast?.variant === "alert"
        ? BellRing
        : toast?.variant === "info"
          ? Info
          : MapPinned;

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.98 }}
          className={cn(
            "pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4",
            className
          )}
        >
          <div
            className={cn(
              "flex min-h-16 w-full max-w-md items-center gap-3 rounded-3xl px-5 text-base font-semibold text-white shadow-soft",
              toast.variant === "success" && "bg-success",
              toast.variant === "alert" && "bg-[#E84142]",
              toast.variant === "info" && "bg-[#1F2937]",
              toast.variant === "neutral" && "bg-ink"
            )}
          >
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full bg-white",
                toast.variant === "success" && "text-success",
                toast.variant === "alert" && "text-[#E84142]",
                toast.variant === "info" && "text-[#1F2937]",
                toast.variant === "neutral" && "text-ink"
              )}
            >
              <Icon className="size-5" />
            </span>
            <span>{toast.title}</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
