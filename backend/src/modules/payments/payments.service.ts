import axios from "axios";
import { createHmac, timingSafeEqual } from "node:crypto";
import { query, withTransaction } from "../../config/database.js";
import { env } from "../../config/env.js";
import { assertMarketCountry, type MarketCountry } from "../../utils/country.js";
import { AppError } from "../../utils/http.js";
import type { PlanTier } from "../../utils/jwt.js";

type PaidPlanTier = Exclude<PlanTier, "free">;
type PaymentProvider = "flutterwave" | "sumup";
type PaymentStatus = "pending" | "active" | "cancelled" | "expired" | "failed";
type ProviderErrorStage =
  | "oauth"
  | "checkout"
  | "v4_direct_charge"
  | "legacy_checkout"
  | "sumup_checkout"
  | "poll_status";

interface WebhookVerification {
  signature?: string | null;
  signatureHeader?: string | null;
  rawBody?: string | null;
}

interface DriverPaymentRow {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  plan_tier: PlanTier;
}

interface PaymentSubscriptionRow {
  id: string;
  driver_id: string;
  provider: PaymentProvider;
  country: MarketCountry;
  plan_tier: PaidPlanTier;
  status: PaymentStatus;
  amount_minor: number;
  currency: string;
  checkout_reference: string;
  checkout_url: string | null;
  provider_checkout_id: string | null;
  provider_payment_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

const PLAN_PRICING: Record<MarketCountry, Record<PaidPlanTier, { amountMinor: number; currency: "NGN" | "GBP" }>> = {
  Nigeria: {
    pro: { amountMinor: 490000, currency: "NGN" },
    fleet: { amountMinor: 1800000, currency: "NGN" }
  },
  UK: {
    pro: { amountMinor: 100, currency: "GBP" },
    fleet: { amountMinor: 100, currency: "GBP" }
  }
};

const PROVIDER_BY_COUNTRY: Record<MarketCountry, PaymentProvider> = {
  Nigeria: "flutterwave",
  UK: "sumup"
};

const FLUTTERWAVE_OAUTH_URL =
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const FLUTTERWAVE_V4_BASE_URLS = {
  live: "https://f4bexperience.flutterwave.com",
  test: "https://developersandbox-api.flutterwave.com"
} as const;

let flutterwaveTokenCache: { accessToken: string; expiresAtMs: number } | null = null;

const SENSITIVE_PROVIDER_KEY_PATTERN =
  /(authorization|bearer|token|secret|password|client_secret|api[_-]?key|encryption|signature)/i;

function truncateString(value: string, maxLength = 1200) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}... [truncated]` : value;
}

function sanitizeProviderData(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeProviderData(item, depth + 1));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 80)
        .map(([key, item]) => [
          key,
          SENSITIVE_PROVIDER_KEY_PATTERN.test(key)
            ? "[redacted]"
            : sanitizeProviderData(item, depth + 1)
        ])
    );
  }

  return typeof value === "string" ? truncateString(value) : value;
}

function messageFromValue(value: unknown): string | null {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return truncateString(value, 500);
  }

  if (Array.isArray(value)) {
    return value.map(messageFromValue).find(Boolean) ?? null;
  }

  if (typeof value !== "object") {
    return truncateString(String(value), 500);
  }

  const record = value as Record<string, unknown>;
  return (
    messageFromValue(record.message) ??
    messageFromValue(record.error_description) ??
    messageFromValue(record.error) ??
    messageFromValue(record.reason) ??
    messageFromValue(record.detail) ??
    messageFromValue(record.details) ??
    messageFromValue(record.errors) ??
    messageFromValue(asRecord(record.data).message) ??
    messageFromValue(asRecord(record.meta).message) ??
    null
  );
}

function providerLabel(provider: PaymentProvider) {
  return provider === "flutterwave" ? "Flutterwave" : "SumUp";
}

function createProviderError(provider: PaymentProvider, stage: ProviderErrorStage, error: unknown) {
  if (axios.isAxiosError(error)) {
    const providerResponse = sanitizeProviderData(error.response?.data);
    const providerMessage =
      messageFromValue(error.response?.data) ?? messageFromValue(error.message) ?? "Provider request failed";
    const details = {
      provider,
      stage,
      statusCode: error.response?.status ?? null,
      providerMessage,
      providerResponse,
      requestUrl: error.config?.url,
      method: error.config?.method?.toUpperCase()
    };
    const status = error.response?.status ? ` HTTP ${error.response.status}` : "";

    return new AppError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      `${providerLabel(provider)} ${stage.replace(/_/g, " ")} failed${status}: ${providerMessage}`,
      details
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AppError(
    502,
    "PAYMENT_PROVIDER_ERROR",
    `${providerLabel(provider)} ${stage.replace(/_/g, " ")} failed: ${message}`,
    {
      provider,
      stage,
      providerMessage: message
    }
  );
}

function amountMajor(amountMinor: number) {
  return Number((amountMinor / 100).toFixed(2));
}

function defaultSuccessUrl(reference: string) {
  const baseUrl = env.PAYMENT_SUCCESS_URL ?? `${env.FRONTEND_URL}/app/profile`;
  const url = new URL(baseUrl);
  url.searchParams.set("payment", "success");
  url.searchParams.set("reference", reference);
  return url.toString();
}

function defaultCancelUrl(reference: string) {
  const baseUrl = env.PAYMENT_CANCEL_URL ?? `${env.FRONTEND_URL}/app/profile`;
  const url = new URL(baseUrl);
  url.searchParams.set("payment", "cancelled");
  url.searchParams.set("reference", reference);
  return url.toString();
}

function mapSubscription(row: PaymentSubscriptionRow | null) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    provider: row.provider,
    country: row.country,
    tier: row.plan_tier,
    status: row.status,
    amountMinor: row.amount_minor,
    currency: row.currency,
    checkoutReference: row.checkout_reference,
    checkoutUrl: row.checkout_url,
    providerCheckoutId: row.provider_checkout_id,
    providerPaymentId: row.provider_payment_id,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDriver(driver: DriverPaymentRow) {
  return {
    id: driver.id,
    fullName: driver.full_name,
    email: driver.email,
    phone: driver.phone,
    country: assertMarketCountry(driver.country),
    planTier: driver.plan_tier
  };
}

function checkoutReference(driverId: string, tier: PaidPlanTier) {
  return `rs${tier}${Date.now()}${driverId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}`;
}

async function getDriver(driverId: string) {
  const result = await query<DriverPaymentRow>(
    `SELECT id, full_name, email, phone, country, plan_tier
     FROM drivers
     WHERE id = $1`,
    [driverId]
  );

  const driver = result.rows[0];
  if (!driver) {
    throw new AppError(404, "NOT_FOUND", "Driver not found");
  }

  return driver;
}

function requireProviderConfig(provider: PaymentProvider) {
  if (provider === "flutterwave" && !hasFlutterwaveV4Config() && !getFlutterwaveStandardSecretKey()) {
    throw new AppError(
      503,
      "PAYMENT_PROVIDER_UNCONFIGURED",
      "Flutterwave V4 credentials are missing. Set FLUTTERWAVE_CLIENT_ID and FLUTTERWAVE_CLIENT_SECRET."
    );
  }

  if (provider === "sumup" && (!env.SUMUP_API_KEY || !env.SUMUP_MERCHANT_CODE)) {
    throw new AppError(503, "PAYMENT_PROVIDER_UNCONFIGURED", "SumUp credentials are missing");
  }
}

function getFlutterwaveStandardSecretKey() {
  if (env.FLUTTERWAVE_SECRET_KEY) {
    return env.FLUTTERWAVE_SECRET_KEY;
  }

  // Some Flutterwave dashboards label the Standard Checkout secret as "client secret".
  // Only treat it as a checkout bearer token when it has Flutterwave's FLWSECK prefix.
  return env.FLUTTERWAVE_CLIENT_SECRET.startsWith("FLWSECK") ? env.FLUTTERWAVE_CLIENT_SECRET : "";
}

function hasFlutterwaveV4Config() {
  return Boolean(env.FLUTTERWAVE_CLIENT_ID && env.FLUTTERWAVE_CLIENT_SECRET);
}

function flutterwaveBaseUrl() {
  return FLUTTERWAVE_V4_BASE_URLS[env.FLUTTERWAVE_ENV];
}

async function getFlutterwaveAccessToken() {
  if (!hasFlutterwaveV4Config()) {
    throw new AppError(503, "PAYMENT_PROVIDER_UNCONFIGURED", "Flutterwave V4 credentials are missing");
  }

  const now = Date.now();
  if (flutterwaveTokenCache && flutterwaveTokenCache.expiresAtMs > now + 60_000) {
    return flutterwaveTokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.FLUTTERWAVE_CLIENT_ID,
    client_secret: env.FLUTTERWAVE_CLIENT_SECRET
  });

  let response;
  try {
    response = await axios.post(FLUTTERWAVE_OAUTH_URL, body, {
      headers: { "content-type": "application/x-www-form-urlencoded" },
      timeout: 15000
    });
  } catch (error) {
    throw createProviderError("flutterwave", "oauth", error);
  }

  const data = response.data as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new AppError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      "Flutterwave V4 OAuth did not return an access token",
      {
        provider: "flutterwave",
        stage: "oauth",
        providerResponse: sanitizeProviderData(response.data)
      }
    );
  }

  flutterwaveTokenCache = {
    accessToken: data.access_token,
    expiresAtMs: now + Math.max(60, data.expires_in ?? 600) * 1000
  };

  return data.access_token;
}

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "RideSpot";
  const last = parts.slice(1).join(" ") || "Driver";
  return { first, last };
}

function parsePhone(phone: string | null) {
  if (!phone) {
    return undefined;
  }

  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return undefined;
  }

  if (digits.startsWith("234") && digits.length > 3) {
    return { country_code: "234", number: digits.slice(3) };
  }

  if (digits.startsWith("0") && digits.length > 1) {
    return { country_code: "234", number: digits.slice(1) };
  }

  return { country_code: "234", number: digits };
}

async function createFlutterwaveCheckout(input: {
  subscriptionId: string;
  reference: string;
  tier: PaidPlanTier;
  amountMinor: number;
  currency: string;
  driver: DriverPaymentRow;
}) {
  if (hasFlutterwaveV4Config()) {
    return createFlutterwaveV4Checkout(input);
  }

  return createFlutterwaveLegacyCheckout(input);
}

async function createFlutterwaveV4Checkout(input: {
  subscriptionId: string;
  reference: string;
  tier: PaidPlanTier;
  amountMinor: number;
  currency: string;
  driver: DriverPaymentRow;
}) {
  const accessToken = await getFlutterwaveAccessToken();
  const name = splitName(input.driver.full_name);
  const traceId = input.reference;
  let response;
  try {
    response = await axios.post(
      `${flutterwaveBaseUrl()}/orchestration/direct-charges`,
      {
        amount: amountMajor(input.amountMinor),
        currency: input.currency,
        reference: input.reference,
        redirect_url: defaultSuccessUrl(input.reference),
        customer: {
          email: input.driver.email,
          name,
          phone: parsePhone(input.driver.phone)
        },
        payment_method: {
          type: env.FLUTTERWAVE_PAYMENT_METHOD || "opay"
        },
        meta: {
          subscriptionId: input.subscriptionId,
          driverId: input.driver.id,
          tier: input.tier
        }
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Trace-Id": traceId,
          "X-Idempotency-Key": input.reference
        },
        timeout: 15000
      }
    );
  } catch (error) {
    throw createProviderError("flutterwave", "v4_direct_charge", error);
  }

  const data = response.data as {
    data?: {
      id?: string;
      next_action?: {
        redirect_url?: {
          url?: string;
        };
      };
    };
  };
  const checkoutUrl = data.data?.next_action?.redirect_url?.url;
  if (!checkoutUrl) {
    throw new AppError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      "Flutterwave V4 did not return a redirect URL",
      {
        provider: "flutterwave",
        stage: "v4_direct_charge",
        providerResponse: sanitizeProviderData(response.data)
      }
    );
  }

  return {
    checkoutUrl,
    providerCheckoutId: data.data?.id ?? null
  };
}

async function createFlutterwaveLegacyCheckout(input: {
  subscriptionId: string;
  reference: string;
  tier: PaidPlanTier;
  amountMinor: number;
  currency: string;
  driver: DriverPaymentRow;
}) {
  const secretKey = getFlutterwaveStandardSecretKey();
  const planId =
    input.tier === "pro" ? env.FLUTTERWAVE_PRO_PLAN_ID_NG : env.FLUTTERWAVE_FLEET_PLAN_ID_NG;

  let response;
  try {
    response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: input.reference,
        amount: amountMajor(input.amountMinor),
        currency: input.currency,
        redirect_url: defaultSuccessUrl(input.reference),
        payment_plan: planId || undefined,
        customer: {
          email: input.driver.email,
          name: input.driver.full_name,
          phonenumber: input.driver.phone ?? undefined
        },
        customizations: {
          title: `RideSpot ${input.tier}`,
          description: `RideSpot ${input.tier} monthly subscription`
        },
        meta: {
          subscriptionId: input.subscriptionId,
          driverId: input.driver.id,
          tier: input.tier
        }
      },
      {
        headers: {
          Authorization: `Bearer ${secretKey}`
        },
        timeout: 15000
      }
    );
  } catch (error) {
    throw createProviderError("flutterwave", "legacy_checkout", error);
  }

  const data = response.data as { data?: { link?: string; id?: string | number } };
  const checkoutUrl = data.data?.link;
  if (!checkoutUrl) {
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "Flutterwave did not return a checkout URL", {
      provider: "flutterwave",
      stage: "legacy_checkout",
      providerResponse: sanitizeProviderData(response.data)
    });
  }

  return {
    checkoutUrl,
    providerCheckoutId: data.data?.id ? String(data.data.id) : null
  };
}

async function createSumUpCheckout(input: {
  reference: string;
  tier: PaidPlanTier;
  amountMinor: number;
  currency: string;
}) {
  let response;
  try {
    response = await axios.post(
      "https://api.sumup.com/v0.1/checkouts",
      {
        checkout_reference: input.reference,
        amount: amountMajor(input.amountMinor),
        currency: input.currency,
        merchant_code: env.SUMUP_MERCHANT_CODE,
        description: `RideSpot ${input.tier} monthly subscription`,
        redirect_url: defaultSuccessUrl(input.reference),
        return_url: defaultCancelUrl(input.reference),
        hosted_checkout: {
          enabled: true
        }
      },
      {
        headers: {
          Authorization: `Bearer ${env.SUMUP_API_KEY}`
        },
        timeout: 15000
      }
    );
  } catch (error) {
    throw createProviderError("sumup", "sumup_checkout", error);
  }

  const data = response.data as {
    id?: string;
    hosted_checkout_url?: string;
    checkout_url?: string;
    links?: Array<{ rel?: string; href?: string }>;
  };
  const checkoutUrl =
    data.hosted_checkout_url ??
    data.checkout_url ??
    data.links?.find((link) => link.rel === "payment" || link.rel === "redirect")?.href;

  if (!checkoutUrl) {
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "SumUp did not return a checkout URL", {
      provider: "sumup",
      stage: "sumup_checkout",
      providerResponse: sanitizeProviderData(response.data)
    });
  }

  return {
    checkoutUrl,
    providerCheckoutId: data.id ?? null
  };
}

function normaliseProviderStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isPaidStatus(status: string) {
  return ["paid", "successful", "success", "completed", "confirmed", "succeeded"].includes(status);
}

function isTerminalFailedStatus(status: string) {
  return ["failed", "cancelled", "canceled", "expired"].includes(status);
}

function extractCheckoutStatus(checkout: Record<string, unknown>) {
  return normaliseProviderStatus(checkout.status);
}

function extractSumUpPaymentId(checkout: Record<string, unknown>) {
  const transaction = asRecord(checkout.transaction);
  return String(
    checkout.transaction_id ??
      checkout.transaction_code ??
      transaction.id ??
      transaction.transaction_code ??
      ""
  );
}

async function fetchSumUpCheckout(subscription: PaymentSubscriptionRow) {
  const headers = { Authorization: `Bearer ${env.SUMUP_API_KEY}` };

  if (subscription.provider_checkout_id) {
    const response = await axios.get(
      `https://api.sumup.com/v0.1/checkouts/${subscription.provider_checkout_id}`,
      { headers, timeout: 15000 }
    );
    return asRecord(response.data);
  }

  const response = await axios.get("https://api.sumup.com/v0.1/checkouts", {
    headers,
    params: { checkout_reference: subscription.checkout_reference },
    timeout: 15000
  });

  const data = response.data;
  if (Array.isArray(data)) {
    return asRecord(data[0]);
  }

  const items = asRecord(data).items;
  return Array.isArray(items) ? asRecord(items[0]) : asRecord(data);
}

async function updateSubscriptionStatus(id: string, status: PaymentStatus) {
  const result = await query<PaymentSubscriptionRow>(
    `UPDATE payment_subscriptions
     SET status = $2,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, status]
  );

  return result.rows[0] ?? null;
}

async function pollSumUpSubscription(subscription: PaymentSubscriptionRow) {
  if (subscription.provider !== "sumup" || subscription.status !== "pending") {
    return subscription;
  }

  requireProviderConfig("sumup");

  const checkout = await fetchSumUpCheckout(subscription);
  const status = extractCheckoutStatus(checkout);

  if (isPaidStatus(status)) {
    return activateSubscription(
      subscription.checkout_reference,
      extractSumUpPaymentId(checkout) || null
    );
  }

  if (isTerminalFailedStatus(status)) {
    return updateSubscriptionStatus(
      subscription.id,
      status === "expired" ? "expired" : status === "cancelled" || status === "canceled" ? "cancelled" : "failed"
    );
  }

  return subscription;
}

async function fetchFlutterwaveCharge(subscription: PaymentSubscriptionRow) {
  if (!subscription.provider_checkout_id) {
    return null;
  }

  const accessToken = await getFlutterwaveAccessToken();
  const response = await axios.get(
    `${flutterwaveBaseUrl()}/charges/${subscription.provider_checkout_id}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000
    }
  );

  return asRecord(response.data);
}

function extractFlutterwaveChargeStatus(charge: Record<string, unknown>) {
  const data = asRecord(charge.data);
  return normaliseProviderStatus(data.status ?? charge.status);
}

function extractFlutterwaveChargePaymentId(charge: Record<string, unknown>) {
  const data = asRecord(charge.data);
  return String(data.id ?? charge.id ?? data.transaction_id ?? "");
}

async function pollFlutterwaveSubscription(subscription: PaymentSubscriptionRow) {
  if (subscription.provider !== "flutterwave" || subscription.status !== "pending") {
    return subscription;
  }

  if (!hasFlutterwaveV4Config()) {
    return subscription;
  }

  const charge = await fetchFlutterwaveCharge(subscription);
  if (!charge) {
    return subscription;
  }

  const status = extractFlutterwaveChargeStatus(charge);
  if (isPaidStatus(status)) {
    return activateSubscription(
      subscription.checkout_reference,
      extractFlutterwaveChargePaymentId(charge) || null
    );
  }

  if (isTerminalFailedStatus(status)) {
    return updateSubscriptionStatus(
      subscription.id,
      status === "expired" ? "expired" : status === "cancelled" || status === "canceled" ? "cancelled" : "failed"
    );
  }

  return subscription;
}

async function pollProviderSubscription(subscription: PaymentSubscriptionRow) {
  if (subscription.provider === "sumup") {
    return pollSumUpSubscription(subscription);
  }

  if (subscription.provider === "flutterwave") {
    return pollFlutterwaveSubscription(subscription);
  }

  return subscription;
}

async function recordWebhook(provider: PaymentProvider, eventId: string, payload: unknown) {
  const result = await query<{ id: string }>(
    `INSERT INTO payment_webhook_events (provider, provider_event_id, payload)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (provider, provider_event_id) DO NOTHING
     RETURNING id`,
    [provider, eventId, JSON.stringify(payload)]
  );

  return Boolean(result.rows[0]);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function extractReference(payload: unknown) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const nestedObject = asRecord(root.object);
  return String(
    data.reference ??
      data.tx_ref ??
      data.checkout_reference ??
      root.reference ??
      root.tx_ref ??
      root.checkout_reference ??
      nestedObject.checkout_reference ??
      data.id ??
      root.id ??
      ""
  );
}

function extractProviderPaymentId(payload: unknown) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  return String(data.id ?? root.id ?? data.charge_id ?? root.charge_id ?? data.transaction_id ?? root.transaction_id ?? "");
}

function isSuccessfulWebhook(payload: unknown) {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const status = String(data.status ?? root.status ?? data.transaction_status ?? "").toLowerCase();
  const event = String(root.event ?? root.type ?? "").toLowerCase();
  return (
    ["successful", "success", "paid", "completed", "confirmed", "succeeded"].includes(status) ||
    event.includes("charge.completed") ||
    event.includes("charge.succeeded") ||
    event.includes("checkout.paid")
  );
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyFlutterwaveWebhook(verification?: WebhookVerification) {
  if (!env.FLUTTERWAVE_WEBHOOK_SECRET) {
    return;
  }

  const signature = verification?.signature?.trim();
  if (!signature) {
    throw new AppError(401, "UNAUTHORIZED", "Missing Flutterwave webhook signature");
  }

  if (verification?.signatureHeader === "flutterwave-signature") {
    if (!verification.rawBody) {
      throw new AppError(401, "UNAUTHORIZED", "Missing raw webhook body for Flutterwave signature verification");
    }

    const expected = createHmac("sha256", env.FLUTTERWAVE_WEBHOOK_SECRET)
      .update(verification.rawBody)
      .digest("base64");

    if (!safeEqual(signature, expected)) {
      throw new AppError(401, "UNAUTHORIZED", "Invalid Flutterwave webhook signature");
    }

    return;
  }

  if (!safeEqual(signature, env.FLUTTERWAVE_WEBHOOK_SECRET)) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid Flutterwave webhook signature");
  }
}

async function activateSubscription(referenceOrProviderId: string, providerPaymentId: string | null) {
  return withTransaction(async (client) => {
    const result = await client.query<PaymentSubscriptionRow>(
      `UPDATE payment_subscriptions
       SET status = 'active',
           provider_payment_id = COALESCE($2, provider_payment_id),
           current_period_start = COALESCE(current_period_start, NOW()),
           current_period_end = NOW() + INTERVAL '1 month',
           updated_at = NOW()
       WHERE checkout_reference = $1
          OR provider_checkout_id = $1
       RETURNING *`,
      [referenceOrProviderId, providerPaymentId]
    );

    const subscription = result.rows[0];
    if (!subscription) {
      return null;
    }

    await client.query(
      `UPDATE drivers
       SET plan_tier = $2, updated_at = NOW()
       WHERE id = $1`,
      [subscription.driver_id, subscription.plan_tier]
    );

    return subscription;
  });
}

export const paymentsService = {
  pricingForCountry(country: MarketCountry) {
    return {
      provider: PROVIDER_BY_COUNTRY[country],
      plans: PLAN_PRICING[country]
    };
  },

  async createCheckout(driverId: string, tier: PaidPlanTier) {
    const driver = await getDriver(driverId);
    const country = assertMarketCountry(driver.country);
    const provider = PROVIDER_BY_COUNTRY[country];
    const pricing = PLAN_PRICING[country][tier];
    requireProviderConfig(provider);

    const reference = checkoutReference(driverId, tier);
    const subscriptionResult = await query<PaymentSubscriptionRow>(
      `INSERT INTO payment_subscriptions (
         driver_id, provider, country, plan_tier, status, amount_minor, currency, checkout_reference
       ) VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
       RETURNING *`,
      [driverId, provider, country, tier, pricing.amountMinor, pricing.currency, reference]
    );

    const subscription = subscriptionResult.rows[0];
    if (!subscription) {
      throw new AppError(500, "INTERNAL_SERVER_ERROR", "Could not create payment subscription");
    }

    try {
      const checkout =
        provider === "flutterwave"
          ? await createFlutterwaveCheckout({
              subscriptionId: subscription.id,
              reference,
              tier,
              amountMinor: pricing.amountMinor,
              currency: pricing.currency,
              driver
            })
          : await createSumUpCheckout({
              reference,
              tier,
              amountMinor: pricing.amountMinor,
              currency: pricing.currency
            });

      const updatedResult = await query<PaymentSubscriptionRow>(
        `UPDATE payment_subscriptions
         SET checkout_url = $2,
             provider_checkout_id = $3,
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [subscription.id, checkout.checkoutUrl, checkout.providerCheckoutId]
      );

      return {
        provider,
        checkoutUrl: checkout.checkoutUrl,
        reference,
        subscription: mapSubscription(updatedResult.rows[0] ?? subscription)
      };
    } catch (error) {
      await query(
        `UPDATE payment_subscriptions
         SET status = 'failed', updated_at = NOW()
         WHERE id = $1`,
        [subscription.id]
      );

      if (error instanceof AppError) {
        throw error;
      }

      throw createProviderError(provider, "checkout", error);
    }
  },

  async getStatus(driverId: string) {
    let driver = await getDriver(driverId);
    const country = assertMarketCountry(driver.country);
    const subscriptionResult = await query<PaymentSubscriptionRow>(
      `SELECT *
       FROM payment_subscriptions
       WHERE driver_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [driverId]
    );

    const subscription = subscriptionResult.rows[0]
      ? await pollProviderSubscription(subscriptionResult.rows[0])
      : null;

    if (subscription?.status === "active") {
      driver = await getDriver(driverId);
    }

    return {
      driver: mapDriver(driver),
      provider: PROVIDER_BY_COUNTRY[country],
      pricing: PLAN_PRICING[country],
      subscription: mapSubscription(subscription)
    };
  },

  async processWebhook(provider: PaymentProvider, payload: unknown, verification?: WebhookVerification | string | null) {
    const normalizedVerification =
      typeof verification === "string" || verification == null
        ? { signature: verification }
        : verification;

    if (provider === "flutterwave") {
      verifyFlutterwaveWebhook(normalizedVerification);
    }

    if (provider === "sumup" && env.SUMUP_WEBHOOK_SECRET) {
      if (normalizedVerification?.signature !== env.SUMUP_WEBHOOK_SECRET) {
        throw new AppError(401, "UNAUTHORIZED", "Invalid SumUp webhook signature");
      }
    }

    const root = asRecord(payload);
    const reference = extractReference(payload);
    const eventId = String(root.id ?? root.event_id ?? root.event ?? root.type ?? reference);
    if (!eventId || !reference) {
      throw new AppError(400, "VALIDATION_ERROR", "Webhook payload is missing an event id or reference");
    }

    const firstSeen = await recordWebhook(provider, eventId, payload);
    if (!firstSeen) {
      return { processed: false, duplicate: true };
    }

    if (!isSuccessfulWebhook(payload)) {
      return { processed: true, activated: false };
    }

    const subscription = await activateSubscription(reference, extractProviderPaymentId(payload) || null);
    return {
      processed: true,
      activated: Boolean(subscription),
      subscription: mapSubscription(subscription)
    };
  }
};
