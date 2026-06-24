

import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { FaqItemData } from "@/data/marketing";
import { cn } from "@/lib/utils";

export interface FaqItemProps {
  item: FaqItemData;
}

export function FaqItem({ item }: FaqItemProps) {
  const [open, setOpen] = useState(true);

  return (
    <article className="border-b border-line py-5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-base font-bold text-ink md:text-lg">{item.question}</span>
        <span
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas-subtle text-ink-muted transition",
            open && "rotate-45 text-ink"
          )}
        >
          <Plus className="size-4" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="pt-3 text-sm leading-7 text-ink-muted md:text-base">{item.answer}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}
