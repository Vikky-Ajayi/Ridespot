
import { useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";
import { ModalSheet } from "@/components/app/ModalSheet";
import { PlanCard, type SubscriptionPlanItem } from "@/components/profile/PlanCard";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { getApiErrorMessage } from "@/lib/apiError";
import { normaliseMarketCountry } from "@/lib/markets";
import { paymentRepository } from "@/services/repositories";
import type { PlanTier } from "@/types";

export interface SubscriptionModalProps {
  open: boolean;
  onClose: () => void;
}

export function SubscriptionModal({ open, onClose }: SubscriptionModalProps) {
  const [selectedTier, setSelectedTier] = useState<PlanTier>("free");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const { showToast } = useToast();
  const country = normaliseMarketCountry(user?.country) || "Nigeria";
  const provider = country === "UK" ? "SumUp" : "Flutterwave";

  const plans = useMemo<SubscriptionPlanItem[]>(() => {
    const freePrice = country === "UK" ? "£0.00 / Month" : "₦0.00 / Month";
    const proPrice = country === "UK" ? "£1.00 / Month" : "₦4,900.00 / Month";
    const fleetPrice = country === "UK" ? "£1.00 / Month" : "₦18,000.00 / Month";

    return [
      {
        tier: "free",
        price: freePrice,
        subtitle: "Free · No payment needed",
        features: [
          { copy: "Live heatmap (30 min delay)", included: true },
          { copy: "Top 3 hotspots per city", included: true },
          { copy: "Basic earnings tracker", included: true },
          { copy: "Real-time surge alerts", included: false },
          { copy: "Peak hour predictions", included: false }
        ]
      },
      {
        tier: "pro",
        price: proPrice,
        subtitle: "Pro · Monthly subscription",
        badge: "Most Popular",
        features: [
          { copy: "Live heatmap (real time)", included: true },
          { copy: "Unlimited hotspot access", included: true },
          { copy: "Basic earnings tracker", included: true },
          { copy: "Real-time surge alerts", included: true },
          { copy: "Peak hour predictions", included: true }
        ]
      },
      {
        tier: "fleet",
        price: fleetPrice,
        subtitle: "Fleet · Monthly subscription",
        features: [
          { copy: "Live heatmap (real time)", included: true },
          { copy: "Unlimited hotspot access", included: true },
          { copy: "Basic earnings tracker", included: true },
          { copy: "Real-time surge alerts", included: true },
          { copy: "Peak hour predictions", included: true }
        ]
      }
    ];
  }, [country]);

  useEffect(() => {
    if (open) {
      setSelectedTier("free");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const ctaLabel = useMemo(() => {
    if (selectedTier === "pro") {
      return "Start Monthly Plan";
    }

    if (selectedTier === "fleet") {
      return "Start Fleet Plan";
    }

    return "Try For Free";
  }, [selectedTier]);

  async function handleCheckout() {
    setError(null);

    if (selectedTier === "free") {
      onClose();
      return;
    }

    try {
      setSubmitting(true);
      const checkout = await paymentRepository.createCheckout(selectedTier);
      window.location.href = checkout.checkoutUrl;
    } catch (checkoutError) {
      const message = getApiErrorMessage(checkoutError, "Unable to start checkout.");
      setError(message);
      showToast({ title: "Checkout failed. See details below.", variant: "alert" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalSheet open={open} onClose={onClose} panelClassName="max-h-[88vh] overflow-hidden">
      <div className="max-h-[88vh] overflow-y-auto px-4 pb-6 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="[font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            My plans
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-[#F3F4F6] text-ink"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-8 flex flex-col items-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#1D72F3] text-white">
            <MapPin className="size-6" />
          </div>
          <h3 className="mt-5 [font-family:Inter,sans-serif] text-[1rem] font-semibold leading-none tracking-[-0.03em] text-ink">
            Get unlimited access
          </h3>
          <p className="mt-2 text-center text-[0.82rem] font-medium text-[#6B7280]">
            {country} drivers pay through {provider}.
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl bg-[#FEF2F2] px-4 py-3 text-sm font-semibold text-danger">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-[28px] bg-[#F7F8FA] p-3">
          <div className="space-y-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.tier}
                plan={plan}
                selected={plan.tier === selectedTier}
                onSelect={setSelectedTier}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleCheckout()}
          className="mt-6 w-full rounded-2xl bg-black px-4 py-4 text-[1.06rem] font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Starting checkout..." : ctaLabel}
        </button>
      </div>
    </ModalSheet>
  );
}
