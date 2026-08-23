import "dotenv/config";
import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FRONTEND_URL: z.string().min(1, "FRONTEND_URL is required"),
  FRONTEND_URLS: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().min(1).default("7d"),
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
  RESEND_FROM_EMAIL: z.string().email("RESEND_FROM_EMAIL must be a valid email"),
  TICKETMASTER_API_KEY: z.string().default(""),
  EVENTBRITE_API_KEY: z.string().default(""),
  EVENTBRITE_OFFICIAL_DISCOVERY_ENABLED: booleanFromEnv.default(true),
  EVENTBRITE_PUBLIC_SCRAPER_ENABLED: booleanFromEnv.default(true),
  EVENTBRITE_SCRAPER_USER_AGENT: z.string().default("RideSpotBot/1.0 (+https://heyzono.com)"),
  EVENT_AGGREGATOR_PROVIDER: z.string().default(""),
  EVENT_AGGREGATOR_API_KEY: z.string().default(""),
  PUBLIC_EVENT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  EVENTBRITE_SITEMAP_CRAWL_ENABLED: booleanFromEnv.default(true),
  EVENTBRITE_SITEMAP_MAX_EVENT_PAGES_PER_CYCLE: z.coerce.number().int().positive().default(2000),
  OVERPASS_API_URL: z.string().default(""),
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  GOOGLE_VISION_API_KEY: z.string().default(""),
  HERE_MAPS_API_KEY: z.string().default(""),
  ML_SERVICE_URL: z.string().url(),
  GROQ_API_KEY: z.string().default(""),
  GROQ_OCR_MODEL: z.string().default("llama-3.3-70b-versatile"),
  ADMIN_OCR_MAX_IMAGE_MB: z.coerce.number().positive().default(8),
  FIREBASE_PROJECT_ID: z.string().default(""),
  FIREBASE_PRIVATE_KEY: z.string().default(""),
  FIREBASE_CLIENT_EMAIL: z.string().default(""),
  FLUTTERWAVE_ENV: z.enum(["test", "live"]).default("live"),
  FLUTTERWAVE_CLIENT_ID: z.string().default(""),
  FLUTTERWAVE_CLIENT_SECRET: z.string().default(""),
  FLUTTERWAVE_PAYMENT_METHOD: z.string().trim().default(""),
  FLUTTERWAVE_PUBLIC_KEY: z.string().default(""),
  FLUTTERWAVE_SECRET_KEY: z.string().default(""),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string().default(""),
  FLUTTERWAVE_WEBHOOK_SECRET: z.string().default(""),
  FLUTTERWAVE_PRO_PLAN_ID_NG: z.string().default(""),
  FLUTTERWAVE_FLEET_PLAN_ID_NG: z.string().default(""),
  SUMUP_API_KEY: z.string().default(""),
  SUMUP_MERCHANT_CODE: z.string().default(""),
  SUMUP_WEBHOOK_SECRET: z.string().default(""),
  BACKEND_PUBLIC_URL: z.string().url().optional(),
  PAYMENT_SUCCESS_URL: z.string().url().optional(),
  PAYMENT_CANCEL_URL: z.string().url().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  throw new Error(`Environment validation failed:\n${issues.join("\n")}`);
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

function withWwwVariant(origin: string) {
  const url = new URL(origin);
  const hostname = url.hostname;
  const variants = [origin];

  if (hostname.startsWith("www.")) {
    url.hostname = hostname.slice(4);
    variants.push(url.origin);
  } else if (!hostname.includes("localhost") && hostname.includes(".")) {
    url.hostname = `www.${hostname}`;
    variants.push(url.origin);
  }

  return variants;
}

const configuredFrontendOrigins = [parsed.data.FRONTEND_URL, parsed.data.FRONTEND_URLS ?? ""]
  .flatMap((value) => value.split(","))
  .map(normalizeOrigin)
  .filter((origin): origin is string => Boolean(origin));

const frontendOrigins = Array.from(
  new Set(configuredFrontendOrigins.flatMap((origin) => withWwwVariant(origin)))
);

if (frontendOrigins.length === 0) {
  throw new Error("Environment validation failed:\nFRONTEND_URL: must contain a valid URL origin");
}

export const env = {
  ...parsed.data,
  FRONTEND_URL: frontendOrigins[0]!,
  FRONTEND_ORIGINS: frontendOrigins,
  FIREBASE_PRIVATE_KEY: parsed.data.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
};

export function hasFirebaseAdminConfig() {
  return Boolean(
    env.FIREBASE_PROJECT_ID && env.FIREBASE_PRIVATE_KEY && env.FIREBASE_CLIENT_EMAIL
  );
}
