import type { AuthUser, PlanTier } from "@/types";
import { api } from "@/services/api";
import { mapDriverSummaryToAuthUser, unwrapData } from "./shared";

type PaidPlanTier = Exclude<PlanTier, "free">;

export interface PaymentSubscription {
  id: string;
  provider: "flutterwave" | "sumup";
  country: "Nigeria" | "UK";
  tier: PaidPlanTier;
  status: "pending" | "active" | "cancelled" | "expired" | "failed";
  amountMinor: number;
  currency: string;
  checkoutReference: string;
  checkoutUrl: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface PaymentStatus {
  driver: AuthUser;
  token: string;
  provider: "flutterwave" | "sumup";
  pricing: Record<PaidPlanTier, { amountMinor: number; currency: string }>;
  subscription: PaymentSubscription | null;
}

export const paymentRepository = {
  async createCheckout(tier: PaidPlanTier) {
    const response = await api.post("/api/payments/checkout", { tier });
    return unwrapData<{
      provider: "flutterwave" | "sumup";
      checkoutUrl: string;
      reference: string;
      subscription: PaymentSubscription;
    }>(response);
  },

  async getStatus() {
    const response = await api.get("/api/payments/status");
    const data = unwrapData<{
      driver: Parameters<typeof mapDriverSummaryToAuthUser>[0];
      token: string;
      provider: "flutterwave" | "sumup";
      pricing: Record<PaidPlanTier, { amountMinor: number; currency: string }>;
      subscription: PaymentSubscription | null;
    }>(response);

    return {
      ...data,
      driver: mapDriverSummaryToAuthUser(data.driver)
    };
  }
};
