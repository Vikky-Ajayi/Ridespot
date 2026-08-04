import { Router } from "express";
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { paymentTransactionsTable, usersTable } from "@workspace/db/schema";
import { requireAuth, type AuthRequest } from "../middlewares/auth.js";

const router = Router();

type PaidPlanTier = "pro" | "fleet";

const PLANS: Record<PaidPlanTier, { name: string; amount: number; currency: string; durationDays: number }> = {
  pro:   { name: "Pro Plan",   amount: 4900,  currency: "NGN", durationDays: 30 },
  fleet: { name: "Fleet Plan", amount: 18000, currency: "NGN", durationDays: 30 },
};

function isValidPlan(tier: unknown): tier is PaidPlanTier {
  return tier === "pro" || tier === "fleet";
}

// POST /api/payments/checkout — create a Flutterwave checkout link
// (also aliased from /initialize for compatibility)
async function handleInitialize(req: AuthRequest, res: ReturnType<typeof import("express").Router>["post"] extends (...args: infer A) => unknown ? never : never): Promise<void>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleInitialize(req: AuthRequest, res: any): Promise<void> {
  const rawTier = (req.body as { tier?: unknown; planId?: unknown }).tier
    ?? (req.body as { tier?: unknown; planId?: unknown }).planId;

  if (!isValidPlan(rawTier)) {
    res.status(400).json({ success: false, error: { code: "INVALID_PLAN", message: "Unknown plan. Use 'pro' or 'fleet'." } });
    return;
  }

  const plan = PLANS[rawTier];

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) {
    res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
    return;
  }

  const txRef = `RS-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const appBaseUrl = process.env.APP_BASE_URL ?? "https://ridespot-production-8e87.up.railway.app";

  // Store the pending transaction first
  await db.insert(paymentTransactionsTable).values({
    driverId: user.id,
    flwReference: txRef, // will be updated with FLW's flw_ref on webhook
    txRef,
    plan: rawTier,
    amount: plan.amount,
    currency: plan.currency,
    status: "pending",
  });

  try {
    // Dynamically import so the server starts even if the package isn't installed
    const Flutterwave = (await import("flutterwave-node-v3")).default;
    const flw = new Flutterwave(
      process.env.FLUTTERWAVE_PUBLIC_KEY!,
      process.env.FLUTTERWAVE_SECRET_KEY!,
    );

    const payload = {
      tx_ref: txRef,
      amount: plan.amount,
      currency: plan.currency,
      redirect_url: `${appBaseUrl}/api/payments/callback`,
      customer: { email: user.email, name: user.fullName },
      customizations: { title: "RideSpot", description: plan.name, logo: "" },
      meta: { driverId: user.id, plan: rawTier },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await (flw.Charge as any).initiate_payment(payload);

    if (response.status !== "success") {
      res.status(502).json({ success: false, error: { code: "FLW_ERROR", message: response.message } });
      return;
    }

    res.json({
      success: true,
      data: {
        provider: "flutterwave",
        checkoutUrl: response.data.link,
        paymentUrl: response.data.link,
        reference: txRef,
        subscription: {
          id: txRef,
          provider: "flutterwave",
          tier: rawTier,
          status: "pending",
          amountMinor: plan.amount,
          currency: plan.currency,
          checkoutReference: txRef,
          checkoutUrl: response.data.link,
          currentPeriodStart: null,
          currentPeriodEnd: null,
        },
      },
    });
  } catch (err) {
    req.log?.error({ err }, "Flutterwave initiate failed");
    res.status(502).json({ success: false, error: { code: "FLW_UNAVAILABLE", message: "Payment provider unavailable" } });
  }
}

router.post("/checkout", requireAuth, handleInitialize);
router.post("/initialize", requireAuth, handleInitialize);

// GET /api/payments/status
router.get("/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.userId!))
      .limit(1);

    if (!user) {
      res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "User not found" } });
      return;
    }

    const [latestTx] = await db
      .select()
      .from(paymentTransactionsTable)
      .where(eq(paymentTransactionsTable.driverId, user.id))
      .orderBy(paymentTransactionsTable.createdAt)
      .limit(1);

    const country = user.country?.toUpperCase();
    const pricing: Record<string, { amountMinor: number; currency: string }> = {
      pro:   { amountMinor: country === "GB" ? 399  : 4900,  currency: country === "GB" ? "GBP" : "NGN" },
      fleet: { amountMinor: country === "GB" ? 1299 : 18000, currency: country === "GB" ? "GBP" : "NGN" },
    };

    res.json({
      success: true,
      data: {
        driver: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          country: user.country,
          avatarUrl: user.avatarUrl,
          planTier: user.subscriptionPlan ?? user.planTier ?? "free",
          isEmailVerified: user.isEmailVerified ?? false,
        },
        token: req.headers.authorization?.split(" ")[1] ?? "",
        provider: country === "GB" ? "sumup" : "flutterwave",
        pricing,
        subscription: latestTx
          ? {
              id: latestTx.id,
              provider: "flutterwave",
              country: country === "GB" ? "UK" : "Nigeria",
              tier: latestTx.plan,
              status: latestTx.status,
              amountMinor: latestTx.amount,
              currency: latestTx.currency ?? "NGN",
              checkoutReference: latestTx.txRef,
              checkoutUrl: null,
              currentPeriodStart: null,
              currentPeriodEnd: null,
            }
          : null,
      },
    });
  } catch (err) {
    req.log?.error({ err }, "GET /payments/status failed");
    res.status(500).json({ success: false, error: { code: "INTERNAL_ERROR", message: "Failed to fetch payment status" } });
  }
});

// POST /api/payments/webhook — Flutterwave webhook
router.post("/webhook", async (req, res) => {
  const hash = req.headers["verif-hash"];
  if (!process.env.FLUTTERWAVE_WEBHOOK_SECRET || hash !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const { event, data } = req.body as { event: string; data: Record<string, unknown> };
  if (event !== "charge.completed" || data.status !== "successful") {
    res.json({ received: true });
    return;
  }

  const txRef = String(data.tx_ref ?? "");

  const [tx] = await db
    .select()
    .from(paymentTransactionsTable)
    .where(eq(paymentTransactionsTable.txRef, txRef))
    .limit(1);

  if (!tx || tx.status === "successful") {
    res.json({ received: true });
    return;
  }

  await db
    .update(paymentTransactionsTable)
    .set({
      flwReference: String(data.flw_ref ?? txRef),
      status: "successful",
      webhookPayload: data,
      updatedAt: new Date(),
    })
    .where(eq(paymentTransactionsTable.txRef, txRef));

  const expiresAt = new Date(Date.now() + 30 * 24 * 3_600_000);
  await db
    .update(usersTable)
    .set({
      subscriptionPlan: tx.plan,
      planTier: tx.plan,
      subscriptionExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, tx.driverId));

  res.json({ received: true });
});

// GET /api/payments/callback — Flutterwave redirect after hosted checkout
router.get("/callback", (req, res) => {
  const { tx_ref, status } = req.query as { tx_ref?: string; status?: string };
  const deepLink =
    status === "successful"
      ? `ridespot://payment/success?ref=${tx_ref ?? ""}`
      : `ridespot://payment/failed?ref=${tx_ref ?? ""}`;
  res.redirect(deepLink);
});

export default router;
