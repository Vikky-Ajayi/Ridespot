import { Link } from "wouter";
import { Check, X } from "lucide-react";
import type { PricingItem } from "@/data/marketing";
import { cn } from "@/lib/utils";

export interface PricingCardProps {
  plan: PricingItem;
}

export function PricingCard({ plan }: PricingCardProps) {
  const href =
    plan.tier === "fleet"
      ? "/contact"
      : `/register${plan.tier === "pro" ? "?plan=pro" : ""}`;

  return (
    <article
      className={cn(
        "rounded-[1.5rem] border border-line bg-white p-6 shadow-soft",
        plan.featured && "border-brand/40 ring-1 ring-brand/30"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-ink">{plan.name}</p>
          <div className="mt-3 flex items-end gap-1">
            <span className="text-4xl font-extrabold tracking-[-0.05em] text-ink">
              {plan.monthlyPriceLabel}
            </span>
            <span className="pb-1 text-sm text-ink-muted">/month</span>
          </div>
          <p className="mt-2 text-sm text-ink-muted">{plan.subtitle}</p>
        </div>
        {plan.featured ? (
          <span className="rounded-full bg-brand px-3 py-1 text-xs font-extrabold text-ink">
            Most Popular
          </span>
        ) : null}
      </div>
      <ul className="mt-8 space-y-4">
        {plan.features.map((feature) => (
          <li key={feature.copy} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-1 inline-flex size-5 items-center justify-center rounded-full",
                feature.included
                  ? "bg-brand-soft text-brand-deep"
                  : "bg-danger-soft text-danger"
              )}
            >
              {feature.included ? <Check className="size-4" /> : <X className="size-4" />}
            </span>
            <span className="text-sm text-ink-muted">{feature.copy}</span>
          </li>
        ))}
      </ul>
      <Link
        href={href}
        className={cn(
          "mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-2xl px-6 text-base font-semibold transition duration-200",
          plan.featured
            ? "bg-ink text-white hover:bg-ink-soft"
            : "border border-ink bg-white text-ink hover:bg-canvas-subtle"
        )}
      >
        {plan.ctaLabel}
      </Link>
    </article>
  );
}
