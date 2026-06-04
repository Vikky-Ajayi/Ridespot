"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, title, onClose, children, className }: ModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/32 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              className={cn(
                "w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-soft",
                className
              )}
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                {title ? <h2 className="text-2xl font-extrabold text-ink">{title}</h2> : <span />}
                <button
                  type="button"
                  aria-label="Close modal"
                  onClick={onClose}
                  className="flex size-10 items-center justify-center rounded-full bg-canvas-subtle text-ink-muted transition hover:text-ink"
                >
                  <X className="size-5" />
                </button>
              </div>
              {children}
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
