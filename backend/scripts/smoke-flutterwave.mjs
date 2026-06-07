import axios from "axios";
import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const OAUTH_URL =
  "https://idp.flutterwave.com/realms/flutterwave/protocol/openid-connect/token";
const CHECKOUT_URL = "https://api.flutterwave.com/v3/payments";

function secretAvailable(name) {
  return Boolean(process.env[name] && process.env[name].trim());
}

function standardSecretKey() {
  const explicit = process.env.FLUTTERWAVE_SECRET_KEY?.trim();
  if (explicit) return explicit;

  const clientSecret = process.env.FLUTTERWAVE_CLIENT_SECRET?.trim() ?? "";
  return clientSecret.startsWith("FLWSECK") ? clientSecret : "";
}

function providerError(error) {
  if (!axios.isAxiosError(error)) {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  return {
    status: error.response?.status ?? null,
    code: error.code ?? null,
    message:
      error.response?.data?.message ??
      error.response?.data?.error_description ??
      error.response?.data?.error ??
      error.message
  };
}

async function smokeOAuth() {
  if (!secretAvailable("FLUTTERWAVE_CLIENT_ID") || !secretAvailable("FLUTTERWAVE_CLIENT_SECRET")) {
    return { configured: false };
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.FLUTTERWAVE_CLIENT_ID,
    client_secret: process.env.FLUTTERWAVE_CLIENT_SECRET
  });

  const response = await axios.post(OAUTH_URL, body, {
    headers: { "content-type": "application/x-www-form-urlencoded" },
    timeout: 15000
  });

  return {
    configured: true,
    ok: Boolean(response.data?.access_token),
    tokenType: response.data?.token_type ?? null,
    expiresIn: response.data?.expires_in ?? null
  };
}

async function smokeStandardCheckout() {
  const secretKey = standardSecretKey();
  if (!secretKey) {
    return {
      configured: false,
      reason:
        "Hosted checkout needs FLUTTERWAVE_SECRET_KEY, or FLUTTERWAVE_CLIENT_SECRET must be an FLWSECK... key."
    };
  }

  const reference = `rs_smoke_${Date.now()}`;
  const response = await axios.post(
    CHECKOUT_URL,
    {
      tx_ref: reference,
      amount: 100,
      currency: "NGN",
      redirect_url: process.env.PAYMENT_SUCCESS_URL || "https://heyzono.com/app/profile",
      customer: {
        email: "smoke-test@heyzono.com",
        name: "RideSpot Smoke Test"
      },
      customizations: {
        title: "RideSpot smoke test",
        description: "RideSpot Flutterwave hosted checkout smoke test"
      },
      meta: {
        smokeTest: true
      }
    },
    {
      headers: { Authorization: `Bearer ${secretKey}` },
      timeout: 15000
    }
  );

  const link = response.data?.data?.link;
  return {
    configured: true,
    ok: Boolean(link),
    reference,
    providerCheckoutId: response.data?.data?.id ? String(response.data.data.id) : null,
    checkoutHost: link ? new URL(link).host : null
  };
}

async function main() {
  const result = {
    timestamp: new Date().toISOString(),
    oauth: null,
    standardCheckout: null
  };

  try {
    result.oauth = await smokeOAuth();
  } catch (error) {
    result.oauth = { configured: true, ok: false, error: providerError(error) };
  }

  try {
    result.standardCheckout = await smokeStandardCheckout();
  } catch (error) {
    result.standardCheckout = { configured: true, ok: false, error: providerError(error) };
  }

  console.log(JSON.stringify(result, null, 2));

  if (result.oauth?.configured && result.oauth.ok === false) {
    process.exitCode = 1;
  }

  if (result.standardCheckout?.configured && result.standardCheckout.ok === false) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ error: providerError(error) }, null, 2));
  process.exitCode = 1;
});
