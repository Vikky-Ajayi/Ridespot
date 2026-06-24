

import { AnimatePresence, motion } from "framer-motion";
import { Check, X } from "lucide-react";
import type { PlanTier } from "@/types";
import { cn } from "@/lib/utils";

export interface SubscriptionPlanItem {
  tier: PlanTier;
  price: string;
  subtitle: string;
  badge?: string;
  features: Array<{
    copy: string;
    included: boolean;
  }>;
}

export interface PlanCardProps {
  plan: SubscriptionPlanItem;
  selected: boolean;
  onSelect: (tier: PlanTier) => void;
}

export function PlanCard({ plan, selected, onSelect }: PlanCardProps) {
  return (
    <div className={cn("rounded-[24px] bg-white", selected && "shadow-[0_4px_12px_rgba(17,24,39,0.04)]")}>
      <button
        type="button"
        onClick={() => onSelect(plan.tier)}
        className="flex w-full items-start justify-between gap-3 px-5 py-5 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[1.15rem] font-bold tracking-[-0.05em] text-ink">{plan.price}</p>
            {plan.badge ? (
              <span className="rounded-full bg-[#00D46A] px-2 py-0.5 text-[0.7rem] font-semibold text-white">
                {plan.badge}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[0.98rem] font-medium text-[#6B7280]">{plan.subtitle}</p>
        </div>

        {selected ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-[#1D72F3] text-white">
            <Check className="size-4" />
          </span>
        ) : (
          <span className="mt-1 block size-7 rounded-full border border-[#9CA3AF]" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="mx-5 h-px bg-[#E5E7EB]" />
            <div className="space-y-4 px-5 py-5">
              {plan.features.map((feature) => (
                <div key={feature.copy} className="flex items-center gap-3">
                  {feature.included ? (
                    <Check className="size-5 text-[#00D46A]" />
                  ) : (
                    <X className="size-5 text-[#EF4444]" />
                  )}
                  <span
                    className={cn(
                      "text-[1rem] font-medium",
                      feature.included ? "text-[#4B5563]" : "text-[#6B7280]"
                    )}
                  >
                    {feature.copy}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
